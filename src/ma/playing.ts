import type { Player, PlayerQueue } from "./types";

/** Pure reads of player and queue state, shared by the keys and tested on their own. */

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
