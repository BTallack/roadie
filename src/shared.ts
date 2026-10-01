import streamDeck from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { SELECTED, Session } from "./ma/session";
import type { Player } from "./ma/types";

export { canTransport, nowPlayingOf, playbackState, volumeOf, type Playing } from "./ma/playing";

type Settings = Record<string, JsonValue | undefined>;

/** Global settings: one Music Assistant server for every key, kept by Stream Deck. */
export type GlobalSettings = {
	url?: string;
	token?: string;
	/** What new keys start with: the player and name settings shared by every kind, the rest per kind. */
	defaults?: { shared?: Settings; actions?: Record<string, Settings> } | Settings;
	/** Each Stream Deck's selected player, by device id. */
	selectedPlayers?: Record<string, string>;
	/** Before 0.3: one selection for every deck. Read as the starting point for decks without their own. */
	selectedPlayerId?: string;
};

/** Settings every kind of key shares, so a row of keys for one room takes one pick. */
const SHARED = new Set(["playerId", "hideName", "hideCaption"]);

/** Settings about one key alone, never carried to a new one. */
const NOT_REMEMBERED = new Set(["playlistUri", "radioUri", "albumUri", "artistUri", "targetId", "players"]);

let shared: Settings = {};
let byAction: Record<string, Settings> = {};

/** Keeps a key's settings as the starting point for the next new key of its kind. */
export function rememberDefaults(actionId: string, settings: Settings, sharesPlayer = true): void {
	const nextShared = { ...shared };
	const nextOwn = { ...(byAction[actionId] ?? {}) };
	for (const [key, value] of Object.entries(settings)) {
		if (value === undefined || NOT_REMEMBERED.has(key)) continue;
		if (SHARED.has(key)) {
			if (sharesPlayer) nextShared[key] = value;
		} else {
			nextOwn[key] = value;
		}
	}
	if (JSON.stringify(nextShared) === JSON.stringify(shared) && JSON.stringify(nextOwn) === JSON.stringify(byAction[actionId] ?? {})) return;
	shared = nextShared;
	byAction = { ...byAction, [actionId]: nextOwn };
	saveGlobal({ defaults: { shared, actions: byAction } });
}

/** What a brand-new key starts with. */
export function seedSettings<T extends Settings>(actionId: string, settings: T, sharesPlayer = true): T {
	return { ...(sharesPlayer ? shared : {}), ...(byAction[actionId] ?? {}), ...settings } as T;
}

/** Called with the global settings whenever Stream Deck sends them. */
export function loadGlobal(global: GlobalSettings): void {
	const saved = global.defaults;
	if (saved && typeof saved === "object") {
		if ("shared" in saved || "actions" in saved) {
			shared = { ...((saved as { shared?: Settings }).shared ?? {}) };
			byAction = { ...((saved as { actions?: Record<string, Settings> }).actions ?? {}) };
		} else {
			// Before 0.3 one flat set served every kind of key; keep only what's shared.
			shared = Object.fromEntries(Object.entries(saved as Settings).filter(([key]) => SHARED.has(key)));
		}
	}
	session.restoreSelection(global.selectedPlayers ?? {}, global.selectedPlayerId);
}

/** Selects a player for one Stream Deck and keeps the choice across restarts. */
export function selectPlayer(id: string, device: string): void {
	session.select(id, device);
	saveGlobal({ selectedPlayers: session.selections() });
}

/**
 * Writes some global settings, keeping the rest. Writes are chained so two quick ones
 * (a selection right after a settings change) can't undo each other.
 */
let writing: Promise<unknown> = Promise.resolve();
function saveGlobal(changes: Partial<GlobalSettings>): void {
	writing = writing
		.then(() => streamDeck.settings.getGlobalSettings<GlobalSettings>())
		.then((global) => streamDeck.settings.setGlobalSettings({ ...global, ...changes }))
		.catch((error) => streamDeck.logger.warn(`couldn't save settings: ${error instanceof Error ? error.message : String(error)}`));
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
