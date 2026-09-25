import streamDeck, { action, type KeyDownEvent, type SendToPluginEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import type { Playlist, QueueOption } from "../ma/types";
import { playlistKey } from "../render";
import { session, targetQueue } from "../shared";
import { PlayerAction, type KeyContext, type PlayerSettings } from "./base";

type Settings = PlayerSettings & {
	/** The playlist's Music Assistant URI, e.g. `library://playlist/17`. */
	playlistUri?: string;
	/** Replace the queue (default), play now, play next, or add to the end. */
	enqueue?: QueueOption;
	/** Server default, on, or off. */
	shuffle?: "default" | "on" | "off";
};

/**
 * Loads a playlist on a player. Shows the playlist's artwork and name, framed in green
 * while the player is playing from it and yellow while it's paused on it.
 */
@action({ UUID: "media.tallack.roadie.playlist" })
export class PlaylistAction extends PlayerAction<Settings> {
	/** Playlists by URI, looked up once for the key's name and art; null when it's gone. */
	private playlists = new Map<string, Promise<Playlist | null>>();

	constructor() {
		super();
		// A playlist edited or removed in Music Assistant: look it up again.
		session.on("library", (uri: string | undefined) => {
			if (uri) this.playlists.delete(uri);
			this.redrawAll();
		});
	}

	protected override async draw({ action, settings, player, queue, name, caption }: KeyContext<Settings>): Promise<void> {
		if (!action.isKey()) return;
		const uri = settings.playlistUri;
		const playlist = uri ? await this.lookup(uri) : undefined;
		const art = playlist ? await session.artwork(playlist) : undefined;
		const sources = queue?.sources ?? queue?.radio_source ?? [];
		const loaded = !!uri && sources.some((source) => source.uri === uri);
		const playing = loaded ? (queue!.state === "playing" ? "playing" : queue!.state === "paused" ? "loaded" : false) : false;
		const enabled = player.available && !!uri && playlist !== null;
		const caption_ = !uri ? "Choose a playlist" : playlist === null ? "Playlist gone" : (playlist?.name ?? "…");
		await action.setImage(playlistKey(name, art, caption ? caption_ : null, playing, enabled, true));
	}

	private lookup(uri: string): Promise<Playlist | null> {
		let pending = this.playlists.get(uri);
		if (!pending) {
			pending = session.playlist(uri).then(
				(playlist) => playlist ?? null,
				() => {
					this.playlists.delete(uri);
					return null;
				},
			);
			this.playlists.set(uri, pending);
		}
		return pending;
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const context = this.context(ev.action.id);
		const { playlistUri, enqueue, shuffle } = ev.payload.settings;
		if (!context || !playlistUri || !context.player.available) return void (await ev.action.showAlert());
		const args: Record<string, unknown> = { queue_id: targetQueue(context.player), media: playlistUri, option: enqueue ?? "replace" };
		if (shuffle === "on" || shuffle === "off") args.shuffle = shuffle === "on";
		await this.run(ev.action, () => session.command("player_queues/play_media", args));
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, Settings>): Promise<void> {
		const payload = ev.payload as { event?: string } | undefined;
		if (payload?.event !== "getPlaylists") return super.onSendToPlugin(ev);
		try {
			const playlists = await session.playlists();
			const item = (playlist: (typeof playlists)[number]) => ({ label: `${playlist.name} (${playlist.provider})`, value: playlist.uri });
			const favourites = playlists.filter((playlist) => playlist.favorite);
			const items = favourites.length ? [{ label: "Favourites", children: favourites.map(item) }, { label: "All playlists", children: playlists.map(item) }] : playlists.map(item);
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlaylists", items });
		} catch (error) {
			streamDeck.logger.warn(`playlists failed: ${error instanceof Error ? error.message : String(error)}`);
			await streamDeck.ui.sendToPropertyInspector({ event: "getPlaylists", items: [] });
		}
	}
}
