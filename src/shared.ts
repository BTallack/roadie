import streamDeck from "@elgato/streamdeck";

import { Session } from "./ma/session";
import type { Player, PlayerQueue } from "./ma/types";

/** Global settings: one Music Assistant server for every key, kept by Stream Deck. */
export type GlobalSettings = {
	url?: string;
	token?: string;
};

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
