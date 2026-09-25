import { EventEmitter } from "node:events";

import { Connection, fetchServerInfo, imageURL, isAuthError, normaliseURL, MusicAssistantError } from "./connection";
import { itemImage, type MassEvent, type MediaItem, type Player, type PlayerQueue, type ServerInfo } from "./types";

/** The `playerId` a key stores to follow the deck's selected player instead of one of its own. */
export const SELECTED = "selected";

export type ConnectionState = "unconfigured" | "connecting" | "live" | "offline" | "unauthorized";

type Logger = { info(message: string): void; warn(message: string): void };

/** A playlist, station, album or artist as a picker shows it: `group` tells same-named items apart. */
export type MediaChoice = { uri: string; name: string; group: string; favorite: boolean; /** Picker text when it should say more than the name (album with its artist). */ label?: string };

/** Networks behind the Digitally Imported provider, by the prefix on their station ids. */
const RADIO_NETWORKS: Record<string, string> = { di: "DI.FM", radiotunes: "RadioTunes", rockradio: "RockRadio", jazzradio: "JazzRadio", classicalradio: "ClassicalRadio", zenradio: "ZenRadio" };

/**
 * Everything the keys know about one Music Assistant server, kept current.
 *
 * One WebSocket carries commands and events. Lessons from the Bambuddy fleet built in:
 * - "live" means the server answered the auth command, not that a socket opened;
 * - `GET /info` runs first, so a wrong address, a server in setup, or one too old reads
 *   as its own message;
 * - a dropped socket keeps the last state on the keys and reconnects (1 s doubling to
 *   30 s); a refused token stops retrying until the settings change;
 * - a `time` round-trip every 30 s is the heartbeat (two misses = reconnect), and its
 *   answer gives the clock offset that keeps progress bars honest;
 * - `wake()` starts over at once, for the computer waking from sleep.
 *
 * Emits `change` whenever anything the keys draw might have changed.
 */
export class Session extends EventEmitter {
	private key = "";
	private base?: string;
	private token?: string;
	private connection?: Connection;
	private generation = 0;
	private attempt = 0;
	private retryTimer?: NodeJS.Timeout;
	private heartbeat?: NodeJS.Timeout;
	private missedBeats = 0;
	private artworkCache = new Map<string, Promise<Artwork | undefined>>();

	state: ConnectionState = "unconfigured";
	lastError?: string;
	serverInfo?: ServerInfo;
	players = new Map<string, Player>();
	queues = new Map<string, PlayerQueue>();
	/** Provider instance id to its display name, for the playlist picker. */
	providers = new Map<string, string>();
	/** Server clock minus ours, in seconds. */
	clockOffset = 0;
	/** The player chosen on this deck, for keys set to follow it. */
	selectedPlayerId?: string;

	constructor(private readonly log: Logger) {
		super();
		this.setMaxListeners(200);
	}

	/** Points the session at a server; a no-op when nothing changed. */
	configure(url: string | undefined, token: string | undefined): void {
		const key = `${url ?? ""}\n${token ?? ""}`;
		if (key === this.key) return;
		this.key = key;
		this.stop();
		this.players.clear();
		this.queues.clear();
		this.lastError = undefined;
		if (!url?.trim()) {
			this.base = undefined;
			this.state = "unconfigured";
			this.emit("change");
			return;
		}
		try {
			this.base = normaliseURL(url);
		} catch {
			this.base = undefined;
			this.state = "unconfigured";
			this.lastError = "That isn't a valid address";
			this.emit("change");
			return;
		}
		this.token = token?.trim() || undefined;
		this.start();
	}

	get url(): string | undefined {
		return this.base;
	}

	get connected(): boolean {
		return this.state === "live";
	}

	/** Starts over now: new socket and a fresh load. */
	wake(): void {
		if (!this.base || this.state === "unauthorized") return;
		this.log.info("wake: reconnecting");
		this.stop();
		this.start();
	}

	private start(): void {
		const generation = ++this.generation;
		this.state = "connecting";
		this.emit("change");
		void this.connect(generation);
	}

	private stop(): void {
		this.generation++;
		clearTimeout(this.retryTimer);
		clearInterval(this.heartbeat);
		this.retryTimer = this.heartbeat = undefined;
		this.connection?.removeAllListeners();
		this.connection?.close();
		this.connection = undefined;
	}

	private async connect(generation: number): Promise<void> {
		const base = this.base;
		if (!base) return;
		try {
			this.serverInfo = await fetchServerInfo(base);
			if (generation !== this.generation) return;
			const connection = new Connection(base, this.token, this.log);
			connection.on("event", (event: MassEvent) => {
				if (generation === this.generation) this.handleEvent(event);
			});
			connection.on("close", (reason: string) => {
				if (generation !== this.generation) return;
				this.log.warn(`connection closed: ${reason}`);
				this.dropped(generation, reason);
			});
			await connection.open();
			if (generation !== this.generation) return void connection.close();
			this.connection = connection;
			await this.loadState(connection);
			if (generation !== this.generation) return;
			this.attempt = 0;
			this.missedBeats = 0;
			this.lastError = undefined;
			this.state = "live";
			this.heartbeat = setInterval(() => void this.beat(generation), 30_000);
			this.emit("change");
		} catch (error) {
			if (generation !== this.generation) return;
			this.lastError = error instanceof Error ? error.message : String(error);
			if (isAuthError(error)) {
				this.log.warn(`not authorized: ${this.lastError}`);
				this.stop();
				this.state = "unauthorized";
				this.emit("change");
				return;
			}
			this.log.warn(`connect failed: ${this.lastError}`);
			this.dropped(generation, this.lastError);
		}
	}

	private dropped(generation: number, reason: string): void {
		if (generation !== this.generation) return;
		clearInterval(this.heartbeat);
		this.heartbeat = undefined;
		this.connection?.removeAllListeners();
		this.connection = undefined;
		this.state = "offline";
		this.lastError = reason;
		this.emit("change");
		const delay = Math.min(30, 2 ** this.attempt++) * 1000;
		clearTimeout(this.retryTimer);
		this.retryTimer = setTimeout(() => void this.connect(generation), delay);
	}

	private async loadState(connection: Connection): Promise<void> {
		const [players, queues, providers, time] = await Promise.all([
			connection.command<Player[]>("players/all", { return_unavailable: true, return_disabled: false }),
			connection.command<PlayerQueue[]>("player_queues/all"),
			connection.command<Array<{ instance_id: string; name: string; type: string }>>("providers").catch(() => []),
			connection.ping().catch(() => undefined),
		]);
		this.players.clear();
		for (const player of players) this.players.set(player.player_id, player);
		this.queues.clear();
		for (const queue of queues) this.queues.set(queue.queue_id, queue);
		this.providers.clear();
		for (const provider of providers) this.providers.set(provider.instance_id, provider.name);
		if (time) this.clockOffset = time - Date.now() / 1000;
	}

	private async beat(generation: number): Promise<void> {
		const connection = this.connection;
		if (!connection || generation !== this.generation) return;
		try {
			const time = await connection.ping();
			this.clockOffset = time - Date.now() / 1000;
			this.missedBeats = 0;
		} catch {
			if (++this.missedBeats < 2 || generation !== this.generation) return;
			this.log.warn("no answer to two heartbeats, reconnecting");
			connection.close();
		}
	}

	private handleEvent(event: MassEvent): void {
		const id = event.object_id ?? undefined;
		switch (event.event) {
			case "player_added":
			case "player_updated":
				if (id && event.data && typeof event.data === "object") this.players.set(id, event.data as Player);
				break;
			case "player_removed":
				if (id) this.players.delete(id);
				this.queues.delete(id ?? "");
				break;
			case "queue_added":
			case "queue_updated":
				if (id && event.data && typeof event.data === "object") this.queues.set(id, event.data as PlayerQueue);
				break;
			case "queue_time_updated": {
				const queue = id ? this.queues.get(id) : undefined;
				if (queue && typeof event.data === "number") {
					queue.elapsed_time = event.data;
					queue.elapsed_time_last_updated = Date.now() / 1000 + this.clockOffset;
				}
				break;
			}
			case "media_item_updated":
			case "media_item_deleted":
				this.emit("library", id);
				break;
			case "core_state_updated":
			case "application_shutdown":
				break;
			default:
				return;
		}
		this.emit("change");
	}

	// What the keys read.

	/** Players worth offering: enabled, not a browser's private player; hidden ones on request. */
	playerList(includeHidden = false): Player[] {
		return [...this.players.values()]
			.filter((player) => player.enabled !== false && !player.private && player.type !== "protocol" && (includeHidden || !player.hide_in_ui))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	}

	/** A player by id, or the deck's selected player for the `selected` sentinel. */
	player(id: string | undefined): Player | undefined {
		if (id === SELECTED) id = this.selectedPlayerId;
		return id ? this.players.get(id) : undefined;
	}

	/** Changes the deck's selected player; every key following it redraws. */
	select(id: string | undefined): void {
		if (id === this.selectedPlayerId) return;
		this.selectedPlayerId = id;
		this.emit("selected", id);
		this.emit("change");
	}

	/** Whether a player is grouped under a target: synced to it, or one of its members. */
	isGrouped(player: Player, target: Player): boolean {
		if (player.player_id === target.player_id) return false;
		if (player.synced_to === target.player_id || player.active_group === target.player_id) return true;
		return (target.group_members ?? []).includes(player.player_id);
	}

	/** Players a player may group with, from the server's `can_group_with` (ids or provider instances). */
	groupTargets(player: Player): Player[] {
		const allowed = new Set(player.can_group_with ?? []);
		return this.playerList(true).filter((other) => other.player_id !== player.player_id && (allowed.has(other.player_id) || allowed.has(other.provider) || other.type === "group"));
	}

	/**
	 * The queue a player is actually playing from, the way the server resolves it: a synced
	 * player follows its leader, a grouped one its group. Undefined when the player's source
	 * isn't Music Assistant (Spotify Connect, line-in) or nothing is known yet.
	 */
	queueFor(player: Player | undefined, depth = 0): PlayerQueue | undefined {
		if (!player || depth > 4) return undefined;
		if (player.synced_to && player.synced_to !== player.player_id) return this.queueFor(this.players.get(player.synced_to), depth + 1) ?? this.queues.get(player.synced_to);
		if (player.active_group && player.active_group !== player.player_id) return this.queueFor(this.players.get(player.active_group), depth + 1) ?? this.queues.get(player.active_group);
		const queue = this.queues.get(player.active_source || player.player_id);
		return queue?.active ? queue : undefined;
	}

	/** Progress of the current item, 0..1, moved along at playback pace since the last update. */
	progress(queue: PlayerQueue | undefined): number | null {
		const duration = queue?.current_item?.duration;
		if (!queue || !duration) return null;
		const elapsed = queue.state === "playing" ? queue.elapsed_time + (Date.now() / 1000 + this.clockOffset - queue.elapsed_time_last_updated) : queue.elapsed_time;
		return Math.max(0, Math.min(1, elapsed / duration));
	}

	// Commands.

	/** Sends a command; the keys' `run()` turns the outcome into a tick or an alert. */
	async command<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
		const connection = this.connection;
		if (!connection || this.state !== "live") throw new MusicAssistantError(this.state === "unconfigured" ? "Set up Music Assistant first" : "Not connected to Music Assistant");
		return connection.command<T>(command, args);
	}

	/** Every library playlist, with its provider's name as the group, sorted for a picker. */
	playlists(): Promise<MediaChoice[]> {
		return this.library("playlist", (item, mapping) => (mapping ? (this.providers.get(mapping.provider_instance) ?? mapping.provider_domain) : item.provider));
	}

	/**
	 * Every library radio station, grouped by network where the provider bundles several
	 * (Digitally Imported's DI.FM, JazzRadio…), otherwise by provider. A station on several
	 * networks is listed under each.
	 */
	radios(): Promise<MediaChoice[]> {
		return this.library("radio", (item, mapping) => {
			const network = mapping?.item_id.includes(":") ? RADIO_NETWORKS[mapping.item_id.split(":")[0]] : undefined;
			return network ?? (mapping ? (this.providers.get(mapping.provider_instance) ?? mapping.provider_domain) : item.provider);
		}, true);
	}

	/** Every library album, labelled with its artists, grouped by provider. */
	albums(): Promise<MediaChoice[]> {
		return this.library("album", (item, mapping) => (mapping ? (this.providers.get(mapping.provider_instance) ?? mapping.provider_domain) : item.provider), false, (item) => {
			const artists = item.artists?.map((artist) => artist.name).join(", ");
			return artists ? `${item.name} — ${artists}` : item.name;
		});
	}

	/** Every library artist, grouped by provider; the key turns one into an artist radio. */
	artists(): Promise<MediaChoice[]> {
		return this.library("artist", (item, mapping) => (mapping ? (this.providers.get(mapping.provider_instance) ?? mapping.provider_domain) : item.provider));
	}

	private async library(kind: "playlist" | "radio" | "album" | "artist", groupOf: (item: MediaItem, mapping: MediaItem["provider_mappings"] extends (infer M)[] | undefined ? M | undefined : never) => string, everyMapping = false, labelOf?: (item: MediaItem) => string): Promise<MediaChoice[]> {
		const items = await this.command<MediaItem[]>(`music/${kind}s/library_items`, { limit: 5000, order_by: "sort_name" });
		const choices: MediaChoice[] = [];
		for (const item of items) {
			if (!item.uri) continue;
			const mappings = (item.provider_mappings ?? []).filter((mapping) => mapping.available !== false);
			const considered = everyMapping ? (mappings.length ? mappings : [undefined]) : [mappings[0] ?? item.provider_mappings?.[0]];
			const groups = new Set(considered.map((mapping) => groupOf(item, mapping)));
			for (const group of groups) choices.push({ uri: item.uri, name: item.name, group, favorite: item.favorite === true, label: labelOf?.(item) });
		}
		return choices.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.group.localeCompare(b.group));
	}

	/** One library item by URI, for a key's artwork and name; undefined when it's gone. */
	async item(uri: string): Promise<MediaItem | undefined> {
		try {
			return await this.command<MediaItem>("music/item_by_uri", { uri });
		} catch (error) {
			if (error instanceof MusicAssistantError && error.code === 2) return undefined;
			throw error;
		}
	}

	/** Artwork for an item, fetched once per URL and kept (the last 64). */
	artwork(item: Parameters<typeof itemImage>[0], imageUrl?: string | null): Promise<Artwork | undefined> {
		const url = (imageUrl && /^https?:\/\//.test(imageUrl) ? imageUrl : undefined) ?? (this.base ? imageURL(this.base, itemImage(item), 160) : undefined);
		if (!url) return Promise.resolve(undefined);
		let pending = this.artworkCache.get(url);
		if (!pending) {
			pending = fetchArtwork(url).catch((error) => {
				this.log.warn(`artwork failed: ${error instanceof Error ? error.message : String(error)}`);
				this.artworkCache.delete(url);
				return undefined;
			});
			this.artworkCache.set(url, pending);
			if (this.artworkCache.size > 64) this.artworkCache.delete(this.artworkCache.keys().next().value!);
		}
		return pending;
	}
}

export type Artwork = { data: Buffer; type: string };

async function fetchArtwork(url: string): Promise<Artwork | undefined> {
	const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	if (!response.ok) return undefined;
	const type = response.headers.get("content-type") ?? "image/jpeg";
	if (!type.startsWith("image/")) return undefined;
	return { data: Buffer.from(await response.arrayBuffer()), type };
}
