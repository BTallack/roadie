import streamDeck, { SingletonAction, type Action, type DidReceiveSettingsEvent, type FeedbackPayload, type SendToPluginEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { SELECTED } from "../ma/session";
import type { Player, PlayerQueue } from "../ma/types";
import { messageKey, withOffline, withTick } from "../render";
import { connectionSummary, playerItems, rememberDefaults, seedSettings, session } from "../shared";

/** Every key names the player it's about. */
export type PlayerSettings = {
	playerId?: string;
	/** Leave the player's name off the key. */
	hideName?: boolean;
	/** Glyph keys only: the glyph alone, without the words under it. */
	hideCaption?: boolean;
	[key: string]: JsonValue | undefined;
};

/** What a key has to draw from. */
export type KeyContext<T extends PlayerSettings> = {
	action: Action<T>;
	settings: T;
	player: Player;
	/** The queue the player is playing from, when Music Assistant is its source. */
	queue: PlayerQueue | undefined;
	/** The player's name to draw, or null when the key is set to hide it. */
	name: string | null;
	/** Whether glyph keys draw their caption. */
	caption: boolean;
	/** The Stream Deck the key is on, for the deck's selected player. */
	device: string;
};

/** Anything carrying an action and its settings: a visible key, or a key or dial event. */
type Source<T extends PlayerSettings> = { action: Action<T>; payload: { settings: T } };

/** What goes out to one key or dial, so updates can be deduplicated and rate-limited. */
type Outbox = { sent?: string; want?: string; push?: () => Promise<void>; sentAt: number; timer?: NodeJS.Timeout };

/**
 * Shared by every key: remembers each visible key's settings, redraws when the session
 * changes (and on a timer, so progress keeps moving between events), answers the settings
 * panel's player list, and draws the set-up and missing-player messages.
 *
 * Updates to the deck are deduplicated and held to Elgato's limit of ten a second per key.
 */
export abstract class PlayerAction<T extends PlayerSettings = PlayerSettings> extends SingletonAction<T> {
	protected readonly visible = new Map<string, { action: Action<T>; settings: T }>();
	/** The last key image sent to each key, so a tick can be laid over it. */
	private readonly lastImage = new Map<string, string>();
	private readonly outbox = new Map<string, Outbox>();
	private ticker?: NodeJS.Timeout;
	private tickerMs = 0;
	/** Keys with scrolling text, which need frames a few times a second. */
	private readonly animated = new Set<string>();
	/** How often visible keys redraw on their own, in ms. */
	protected tick = 30_000;
	/** Whether new keys of this kind share the player and name settings with other kinds. */
	protected sharesPlayer = true;
	private redrawTimer?: NodeJS.Timeout;
	private readonly volumeTimers = new Map<string, NodeJS.Timeout>();
	/** The frame rate while any key scrolls text. */
	private static readonly FRAME_MS = 250;
	/** Elgato allows ten updates a second per key or dial. */
	private static readonly MIN_GAP_MS = 100;

	constructor() {
		super();
		session.on("change", () => this.redrawAll());
	}

	/** Draws one key once its player is known. */
	protected abstract draw(context: KeyContext<T>): Promise<void> | void;

	override onWillAppear(ev: WillAppearEvent<T>): void {
		let settings = ev.payload.settings;
		// A key just dragged onto a page has no settings: start it from the last ones used,
		// so a profile of keys for the same player takes one pick, not one per key.
		if (Object.keys(settings).length === 0) {
			settings = seedSettings(ev.action.manifestId, settings, this.sharesPlayer);
			if (Object.keys(settings).length) void ev.action.setSettings(settings).catch(() => undefined);
		}
		this.visible.set(ev.action.id, { action: ev.action, settings });
		this.retime();
		void this.redraw(ev.action.id);
	}

	/** Marks a key as scrolling (or not); the timer speeds up while any key is. */
	protected animate(id: string, on: boolean): void {
		if (on) this.animated.add(id);
		else this.animated.delete(id);
		this.retime();
	}

	private retime(): void {
		const ms = this.visible.size === 0 ? 0 : this.animated.size ? PlayerAction.FRAME_MS : this.tick;
		if (ms === this.tickerMs) return;
		clearInterval(this.ticker);
		this.ticker = ms ? setInterval(() => this.redrawAll(), ms) : undefined;
		this.tickerMs = ms;
	}

	override onWillDisappear(ev: WillDisappearEvent<T>): void {
		const id = ev.action.id;
		this.visible.delete(id);
		this.lastImage.delete(id);
		this.animated.delete(id);
		clearTimeout(this.outbox.get(id)?.timer);
		this.outbox.delete(id);
		this.retime();
		this.didDisappear(id);
	}

	/** For keys with state of their own. */
	protected didDisappear(_id: string): void {}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<T>): void {
		this.visible.set(ev.action.id, { action: ev.action, settings: ev.payload.settings });
		rememberDefaults(ev.action.manifestId, ev.payload.settings, this.sharesPlayer);
		void this.redraw(ev.action.id);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
		const payload = ev.payload as { event?: string } | undefined;
		if (payload?.event === "getPlayers") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlayers", items: playerItems() });
		} else if (payload?.event === "getPlayersOnly") {
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlayersOnly", items: playerItems(false) });
		} else if (payload?.event === "getTargets") {
			// Players the key's own player may group with.
			const settings = await ev.action.getSettings();
			const player = session.player(settings.playerId, ev.action.device.id);
			const items = (player ? session.groupTargets(player) : session.playerList()).map((target) => ({ label: target.name, value: target.player_id }));
			await streamDeck.ui.sendToPropertyInspector({ event: "getTargets", items });
		} else if (payload?.event === "getConnection") {
			await streamDeck.ui.sendToPropertyInspector({
				event: "connection",
				text: connectionSummary(),
				state: session.state,
				server: session.url ? session.url.replace(/^https?:\/\//, "") : null,
				players: session.playerList().length,
			});
		}
	}

	/**
	 * Redraws every visible key, coalesced: a burst of events (a second's worth of queue
	 * time updates across many players) becomes one pass.
	 */
	protected redrawAll(): void {
		if (this.redrawTimer) return;
		this.redrawTimer = setTimeout(() => {
			this.redrawTimer = undefined;
			for (const id of this.visible.keys()) void this.redraw(id);
		}, 40);
	}

	protected async redraw(id: string): Promise<void> {
		const entry = this.visible.get(id);
		if (!entry) return;
		const { action, settings } = entry;
		// Keys inside a multi-action have no face of their own to draw.
		if (action.isKey() && action.isInMultiAction()) return;
		if (!action.isKey() && !action.isDial()) return;
		const context = this.context(entry);
		try {
			if (!context) {
				// Message keys already say what's wrong; they don't get the offline badge.
				if (action.isKey()) this.setImage(action, this.placeholder(settings), false);
				else this.setFeedback(action, { title: "Roadie", value: session.state === "unconfigured" ? "Set up" : session.state === "live" ? "Choose player" : connectionSummary() });
				return;
			}
			await this.draw(context);
		} catch (error) {
			streamDeck.logger.warn(`draw failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Queues an update for one key or dial. Repeats of what was last sent are dropped, and
	 * updates closer together than 100 ms collapse into the latest one.
	 */
	private send(id: string, signature: string, push: () => Promise<void>): void {
		let box = this.outbox.get(id);
		if (!box) this.outbox.set(id, (box = { sentAt: 0 }));
		box.want = signature;
		box.push = push;
		if (box.timer) return;
		const wait = box.sentAt + PlayerAction.MIN_GAP_MS - Date.now();
		if (wait > 0) {
			box.timer = setTimeout(() => {
				box.timer = undefined;
				this.flush(id);
			}, wait);
			return;
		}
		this.flush(id);
	}

	private flush(id: string): void {
		const box = this.outbox.get(id);
		if (!box?.push || box.want === box.sent) return;
		const push = box.push;
		box.sent = box.want;
		box.sentAt = Date.now();
		box.push = undefined;
		push().catch((error) => streamDeck.logger.warn(`update failed: ${error instanceof Error ? error.message : String(error)}`));
	}

	/** Draws a key: badged while Music Assistant is out of reach, sent only when it changed. */
	protected setImage(action: Action<T>, image: string, badge = true): void {
		if (!action.isKey()) return;
		const shown = session.connected || !badge ? image : withOffline(image);
		this.send(action.id, shown, async () => {
			this.lastImage.set(action.id, shown);
			await action.setImage(shown);
		});
	}

	/** Fills a dial's touch strip, sent only when it changed. */
	protected setFeedback(action: Action<T>, feedback: FeedbackPayload): void {
		if (!action.isDial()) return;
		this.send(action.id, JSON.stringify(feedback), () => action.setFeedback(feedback));
	}

	/**
	 * The player and queue a key acts on. Visible keys use their stored settings; a press
	 * from a key in a multi-action (which never appears) uses the event's own settings.
	 */
	protected context(source: { action: Action<T>; settings: T } | Source<T>): KeyContext<T> | undefined {
		const action = source.action;
		const settings = "payload" in source ? source.payload.settings : source.settings;
		const device = action.device.id;
		const player = session.player(settings.playerId, device);
		if (!player) return undefined;
		return { action, settings, player, queue: session.queueFor(player), name: settings.hideName === true ? null : player.name, caption: settings.hideCaption !== true, device };
	}

	private placeholder(settings: T): string {
		switch (session.state) {
			case "unconfigured":
				return messageKey("Set up", "in settings");
			case "connecting":
				return messageKey("Connecting", "to Music Assistant");
			case "unauthorized":
				return messageKey("Token", "refused", "#FF9500");
			case "offline":
				if (session.players.size === 0) return messageKey("Offline", "Retrying…", "#FF9500");
		}
		if (!settings.playerId) return messageKey("Choose", "a player");
		if (settings.playerId === SELECTED) return messageKey("No player", "selected yet");
		return messageKey("Not found", "Pick again");
	}

	/**
	 * Runs a command. Success shows a small tick in the key's corner for a moment (not
	 * Stream Deck's full-key overlay); failure shows the alert and logs.
	 */
	protected async run(action: Action<T>, work: () => Promise<unknown>): Promise<boolean> {
		try {
			await work();
		} catch (error) {
			streamDeck.logger.warn(`command failed: ${error instanceof Error ? error.message : String(error)}`);
			if (action.isKey() || action.isDial()) await action.showAlert().catch(() => undefined);
			return false;
		}
		const image = this.lastImage.get(action.id);
		if (image && action.isKey() && !action.isInMultiAction()) {
			// The tick goes out at once; marking it as sent makes the next redraw replace it.
			const box = this.outbox.get(action.id);
			if (box) {
				box.sent = "tick";
				box.sentAt = Date.now();
			}
			await action.setImage(withTick(image)).catch(() => undefined);
			setTimeout(() => void this.redraw(action.id), 800);
		}
		return true;
	}

	/**
	 * Changes a player's volume from a dial turn: drawn at once, sent to the server at most
	 * every 80 ms, so a fast turn is one command rather than dozens.
	 */
	protected turnVolume(context: KeyContext<T>, ticks: number): void {
		const { player } = context;
		const group = player.type === "group" || (player.volume_level == null && player.group_volume != null);
		const level = group ? player.group_volume : player.volume_level;
		if (level == null) return;
		const target = Math.max(0, Math.min(100, Math.round(level + ticks * 2)));
		if (group) player.group_volume = target;
		else player.volume_level = target;
		void this.redraw(context.action.id);
		clearTimeout(this.volumeTimers.get(player.player_id));
		this.volumeTimers.set(
			player.player_id,
			setTimeout(() => {
				this.volumeTimers.delete(player.player_id);
				void this.run(context.action, () => session.command(group ? "players/cmd/group_volume" : "players/cmd/volume_set", { player_id: player.player_id, volume_level: target }));
			}, 80),
		);
	}
}
