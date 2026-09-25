import streamDeck, { action as _action, type KeyDownEvent, type SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import type { MediaChoice } from "../ma/session";
import type { MediaItem, QueueOption } from "../ma/types";
import { mediaKey, type MediaKind } from "../render";
import { session, targetQueue } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

void _action;

export type MediaSettings = PlayerSettings & {
	/** The playlist's Music Assistant URI, e.g. `library://playlist/17`. */
	playlistUri?: string;
	/** The station's Music Assistant URI, e.g. `library://radio/241`. */
	radioUri?: string;
	/** Replace the queue (default), play now, play next, or add to the end. */
	enqueue?: QueueOption;
	/** Server default, on, or off (playlists only). */
	shuffle?: "default" | "on" | "off";
};

/**
 * A key that loads one library item on a player and shows its artwork and name, framed
 * green while the player is playing it and yellow while paused on it. Playlist and Radio
 * keys differ only in which list they pick from and which setting holds the URI.
 */
export abstract class MediaAction extends PlayerAction<MediaSettings> {
	protected abstract readonly kind: MediaKind;
	protected abstract readonly uriKey: "playlistUri" | "radioUri";
	/** The settings panel's datasource event, e.g. `getPlaylists`. */
	protected abstract readonly listEvent: string;
	protected abstract choices(): Promise<MediaChoice[]>;

	/** Items by URI, looked up once for the key's name and art; null when it's gone. */
	private items = new Map<string, Promise<MediaItem | null>>();

	constructor() {
		super();
		// An item edited or removed in Music Assistant: look it up again.
		session.on("library", (uri: string | undefined) => {
			if (uri) this.items.delete(uri);
			this.redrawAll();
		});
	}

	protected override async draw({ action, settings, player, queue, name, caption }: KeyContext<MediaSettings>): Promise<void> {
		if (!action.isKey()) return;
		const uri = settings[this.uriKey];
		const item = uri ? await this.lookup(uri) : undefined;
		const art = item ? await session.artwork(item) : undefined;
		const sources = queue?.sources ?? queue?.radio_source ?? [];
		const current = queue?.current_item?.media_item?.uri;
		const loaded = !!uri && (sources.some((source) => source.uri === uri) || current === uri);
		const playing = loaded ? (queue!.state === "playing" ? "playing" : queue!.state === "paused" ? "loaded" : false) : false;
		const enabled = player.available && !!uri && item !== null;
		const noun = this.kind === "radio" ? "station" : "playlist";
		const itemName = !uri ? `Choose a ${noun}` : item === null ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} gone` : (item?.name ?? "…");
		await this.setImage(action, mediaKey(this.kind, name, art, caption ? itemName : null, playing, enabled, true));
	}

	private lookup(uri: string): Promise<MediaItem | null> {
		let pending = this.items.get(uri);
		if (!pending) {
			pending = session.item(uri).then(
				(item) => item ?? null,
				() => {
					this.items.delete(uri);
					return null;
				},
			);
			this.items.set(uri, pending);
		}
		return pending;
	}

	override async onKeyDown(ev: KeyDownEvent<MediaSettings>): Promise<void> {
		const context = this.context(ev.action.id);
		const uri = ev.payload.settings[this.uriKey];
		const { enqueue, shuffle } = ev.payload.settings;
		if (!context || !uri || !context.player.available) return void (await ev.action.showAlert());
		const args: Record<string, unknown> = { queue_id: targetQueue(context.player), media: uri, option: enqueue ?? "replace" };
		if (this.kind === "playlist" && (shuffle === "on" || shuffle === "off")) args.shuffle = shuffle === "on";
		await this.run(ev.action, () => session.command("player_queues/play_media", args));
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, MediaSettings>): Promise<void> {
		const payload = ev.payload as { event?: string } | undefined;
		if (payload?.event !== this.listEvent) return super.onSendToPlugin(ev);
		try {
			const choices = await this.choices();
			const item = (choice: MediaChoice) => ({ label: choice.name, value: choice.uri });
			const groups = new Map<string, MediaChoice[]>();
			for (const choice of choices) groups.set(choice.group, [...(groups.get(choice.group) ?? []), choice]);
			const favourites = choices.filter((choice) => choice.favorite);
			const seen = new Set<string>();
			const items: JsonValue[] = [];
			if (favourites.length) items.push({ label: "Favourites", children: favourites.filter((choice) => !seen.has(choice.uri) && seen.add(choice.uri)).map(item) });
			if (groups.size === 1) items.push(...choices.map(item));
			else for (const [group, members] of [...groups].sort(([a], [b]) => a.localeCompare(b))) items.push({ label: group, children: members.map(item) });
			await streamDeck.ui.sendToPropertyInspector({ event: this.listEvent, items });
		} catch (error) {
			streamDeck.logger.warn(`${this.listEvent} failed: ${error instanceof Error ? error.message : String(error)}`);
			await streamDeck.ui.sendToPropertyInspector({ event: this.listEvent, items: [] });
		}
	}
}
