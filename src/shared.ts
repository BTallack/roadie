import streamDeck from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { SELECTED, Session } from "./ma/session";
import type { Player } from "./ma/types";

export { canTransport, nowPlayingOf, playbackState, volumeOf, type Playing } from "./ma/playing";

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
	void streamDeck.settings
		.getGlobalSettings<GlobalSettings>()
		.then((global) => streamDeck.settings.setGlobalSettings({ ...global, defaults }))
		.catch((error) => streamDeck.logger.warn(`couldn't save defaults: ${error instanceof Error ? error.message : String(error)}`));
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
	void streamDeck.settings
		.getGlobalSettings<GlobalSettings>()
		.then((global) => streamDeck.settings.setGlobalSettings({ ...global, selectedPlayerId: id }))
		.catch((error) => streamDeck.logger.warn(`couldn't save the selected player: ${error instanceof Error ? error.message : String(error)}`));
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

/** The queue id to play media on: the leader's, or the player's own when nothing's active. */
export function targetQueue(player: Player): string {
	return session.queueFor(player)?.queue_id ?? player.player_id;
}
