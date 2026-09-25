import streamDeck from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { SELECTED, Session } from "./ma/session";
import type { Player, PlayerQueue } from "./ma/types";

/** Global settings: one Music Assistant server for every key, kept by Stream Deck. */
export type GlobalSettings = {
	url?: string;
	token?: string;
	/** The last settings a key was given, to start the next new key from. */
	defaults?: Record<string, JsonValue | undefined>;
	/** The player chosen on this deck, for keys set to follow it. */
	selectedPlayerId?: string;
};

/** Settings that are about one key alone, never carried to a new one. */
const NOT_REMEMBERED = new Set(["playlistUri", "radioUri", "albumUri", "artistUri", "targetId", "players", "mode"]);

let defaults: Record<string, JsonValue | undefined> = {};

/** Keeps a key's settings as the starting point for the next new key, in memory and in Stream Deck. */
export function rememberDefaults(settings: Record<string, JsonValue | undefined>): void {
	const kept = Object.fromEntries(Object.entries(settings).filter(([key, value]) => !NOT_REMEMBERED.has(key) && value !== undefined));
	if (JSON.stringify({ ...defaults, ...kept }) === JSON.stringify(defaults)) return;
	defaults = { ...defaults, ...kept };
	void streamDeck.settings.getGlobalSettings<GlobalSettings>().then((global) => streamDeck.settings.setGlobalSettings({ ...global, defaults }));
}

/** What a brand-new key starts with. */
export function seedSettings<T extends Record<string, JsonValue | undefined>>(settings: T): T {
	return { ...defaults, ...settings } as T;
}

/** Called with the global settings whenever Stream Deck sends them. */
export function loadDefaults(global: GlobalSettings): void {
	if (global.defaults && typeof global.defaults === "object") defaults = { ...global.defaults };
	if (typeof global.selectedPlayerId === "string" && !session.selectedPlayerId) session.selectedPlayerId = global.selectedPlayerId;
}

/** Selects a player for the deck and keeps the choice across restarts. */
export function selectPlayer(id: string): void {
	session.select(id);
	void streamDeck.settings.getGlobalSettings<GlobalSettings>().then((global) => streamDeck.settings.setGlobalSettings({ ...global, selectedPlayerId: id }));
}

/** The player picker's entries: the deck's selection first, then every player. */
export function playerItems(includeSelected = true): Array<{ label: string; value: string }> {
	const items = session.playerList().map((player) => ({ label: player.type === "group" ? `${player.name} (group)` : player.name, value: player.player_id }));
	return includeSelected ? [{ label: "Selected on this deck", value: SELECTED }, ...items] : items;
}

/** The one server connection all keys share. */
export const session = new Session({
	info: (message) => streamDeck.logger.info(message),
	warn: (message) => streamDeck.logger.warn(message),
});

/** A plain-words summary of the connection, for the settings panel. */
export function connectionSummary(): string {
	const count = session.playerList().length;
	switch (session.state) {
		case "unconfigured":
			return session.lastError ?? "Enter your Music Assistant address to begin.";
		case "connecting":
			return "Connecting…";
		case "live":
			return `Connected, ${count} player${count === 1 ? "" : "s"}`;
		case "offline":
			return `Can't connect: ${session.lastError ?? "no answer"}. Retrying.`;
		case "unauthorized":
			return `Music Assistant refused the token: ${session.lastError ?? "check it"}.`;
	}
}

/** The state a key shows for a player: its queue's when Music Assistant is the source. */
export function playbackState(player: Player, queue: PlayerQueue | undefined): string {
	return queue?.state ?? player.playback_state;
}

/**
 * Whether transport commands are worth sending: a queue takes them all, whatever the
 * player's own features say (sync groups list none); a native source needs the feature.
 */
export function canTransport(player: Player, queue: PlayerQueue | undefined, feature: "pause" | "next_previous"): boolean {
	if (!player.available) return false;
	if (queue) return true;
	return player.supported_features.includes(feature);
}

/** Group players carry `group_volume`; everything else `volume_level`. */
export function volumeOf(player: Player): { level: number | null; muted: boolean; group: boolean } {
	const group = player.type === "group" || (player.volume_level == null && player.group_volume != null);
	return { level: (group ? player.group_volume : player.volume_level) ?? null, muted: (group ? player.group_volume_muted : player.volume_muted) === true, group };
}

/** The queue id to play media on: the leader's, or the player's own when nothing's active. */
export function targetQueue(player: Player): string {
	return session.queueFor(player)?.queue_id ?? player.player_id;
}

/** What a player is playing, split the same way whatever the source. */
export type Playing = {
	track: string | null;
	artist: string | null;
	/** The station, playlist or album it's playing from. */
	source: string | null;
	radio: boolean;
};

/**
 * Reads the current track, artist and source for a player. On a radio stream the queue
 * item is the station, so the track and artist come from what the player reports (the
 * server splits the stream title for it), or from splitting "Artist - Track" ourselves.
 */
export function nowPlayingOf(player: Player, queue: PlayerQueue | undefined): Playing {
	const item = queue?.current_item;
	const media = item?.media_item;
	const reported = player.current_media;
	if (media?.media_type === "radio") {
		const station = media.name;
		const stream = item?.streamdetails?.stream_title ?? (item && item.name !== station ? item.name : null);
		if (reported?.title && (reported.album === station || !stream || stream.includes(reported.title))) {
			return { track: reported.title, artist: reported.artist ?? null, source: station, radio: true };
		}
		const split = stream?.match(/^(.+?)\s+-\s+(.+)$/);
		return { track: split ? split[2] : stream, artist: split ? split[1] : null, source: station, radio: true };
	}
	if (media) {
		const artists = media.artists?.map((artist) => artist.name).join(", ") || null;
		const source = (queue?.sources ?? queue?.radio_source ?? [])[0]?.name ?? media.album?.name ?? null;
		return { track: media.name, artist: artists, source, radio: false };
	}
	if (item) return { track: item.name, artist: null, source: null, radio: false };
	if (reported?.title) return { track: reported.title, artist: reported.artist ?? null, source: reported.album ?? null, radio: false };
	return { track: null, artist: null, source: null, radio: false };
}
