// Connects the plugin's Session to a real Music Assistant (read-only) and writes every key
// for a few players to .preview/, so the drawings can be checked without the hardware.
// Usage: MA_URL=... MA_TOKEN=... npx tsx scripts/preview.ts [player name…]
import { writeFileSync } from "node:fs";

import { Session } from "../src/ma/session";
import { groupKey, heartKey, mediaKey, messageKey, nowPlayingKey, playPauseKey, repeatKey, selectKey, shuffleKey, transferKey, transportKey, volumeKey } from "../src/render";
import { canTransport, playbackState, volumeOf } from "../src/shared";

const session = new Session({ info: console.log, warn: console.warn });
session.configure(process.env.MA_URL, process.env.MA_TOKEN);
const deadline = Date.now() + 20_000;
while (Date.now() < deadline && session.state !== "live" && session.state !== "unauthorized") await new Promise((resolve) => setTimeout(resolve, 250));
console.log(`state: ${session.state} ${session.lastError ?? ""}`);

const decode = (url: string) => decodeURIComponent(url.replace(/^data:image\/svg\+xml;charset=utf8,/, ""));
const write = (name: string, url: string) => writeFileSync(`.preview/${name}.svg`, decode(url));
write("message-setup", messageKey("Set up", "in settings"));
write("message-offline", messageKey("Offline", "Retrying…", "#FF9500"));

const wanted = process.argv.slice(2);
const players = session.playerList(true).filter((player) => wanted.length === 0 || wanted.includes(player.name));
for (const player of players) {
	const queue = session.queueFor(player);
	const state = playbackState(player, queue);
	const slug = player.name.replace(/\W+/g, "-");
	const item = queue?.current_item;
	const title = item?.media_item?.name ?? item?.name ?? player.current_media?.title ?? null;
	const artist = item?.media_item?.artists?.map((a) => a.name).join(", ") ?? player.current_media?.artist ?? null;
	const art = await session.artwork(item?.media_item ?? item, item ? undefined : player.current_media?.image_url);
	const { level, muted } = volumeOf(player);
	const source = (queue?.sources ?? queue?.radio_source ?? [])[0];
	const playlist = source?.uri ? await session.item(source.uri) : undefined;
	const playlistArt = playlist ? await session.artwork(playlist) : undefined;
	const radio = (await session.radios()).find((r) => r.favorite);
	const radioItem = radio ? await session.item(radio.uri) : undefined;
	const radioArt = radioItem ? await session.artwork(radioItem) : undefined;
	const keys: Record<string, string> = {
		nowplaying: nowPlayingKey(player.name, art, { title, artist, state, available: player.available, progress: session.progress(queue) }),
		"nowplaying-noname": nowPlayingKey(null, art, { title, artist, state, available: player.available, progress: session.progress(queue) }),
		playpause: playPauseKey(player.name, state, canTransport(player, queue, "pause")),
		"playpause-icon": playPauseKey(null, state, canTransport(player, queue, "pause"), false),
		next: transportKey("next", player.name, canTransport(player, queue, "next_previous") && state !== "idle"),
		previous: transportKey("previous", player.name, canTransport(player, queue, "next_previous") && state !== "idle"),
		stop: transportKey("stop", player.name, state !== "idle"),
		"volume-up": volumeKey(player.name, level, muted, "up"),
		"volume-down": volumeKey(player.name, level, muted, "down"),
		"volume-mute": volumeKey(player.name, level, false, "mute"),
		"volume-muted": volumeKey(player.name, level, true, "mute"),
		"volume-level": volumeKey(player.name, level, muted, "level"),
		"volume-level-noname": volumeKey(null, level, muted, "level"),
		"volume-level-muted": volumeKey(player.name, level, true, "level"),
		"volume-level-mute": volumeKey(player.name, level, muted, "level_mute"),
		"volume-level-mute-muted": volumeKey(player.name, level, true, "level_mute"),
		"volume-up-signs": volumeKey(player.name, level, muted, "up", true, "signs"),
		"volume-down-signs": volumeKey(player.name, level, muted, "down", true, "signs"),
		"volume-mute-signs": volumeKey(player.name, level, false, "mute", true, "signs"),
		"volume-muted-signs": volumeKey(player.name, level, true, "mute", true, "signs"),
		"volume-up-icon": volumeKey(null, level, muted, "up", false),
		"volume-up-noname": volumeKey(null, level, muted, "up"),
		"nowplaying-art": nowPlayingKey(null, art, { title, artist, state, available: player.available, progress: session.progress(queue), caption: false }),
		"playpause-noname": playPauseKey(null, state, canTransport(player, queue, "pause")),
		"stop-icon": transportKey("stop", null, state !== "idle", false),
		playlist: mediaKey("playlist", player.name, playlistArt, playlist?.name ?? "Choose a playlist", playlist ? (state === "playing" ? "playing" : "loaded") : false, !!playlist),
		"playlist-noname": mediaKey("playlist", null, playlistArt, playlist?.name ?? "Choose a playlist", false, !!playlist),
		"playlist-art": mediaKey("playlist", null, playlistArt, null, false, !!playlist),
		"radio-empty": mediaKey("radio", player.name, undefined, "Choose a station", false, false),
		"album-empty": mediaKey("album", player.name, undefined, "Choose an album", false, false),
		"artist-empty": mediaKey("artist", player.name, undefined, "Choose an artist", false, false),
		shuffle: shuffleKey(player.name, queue?.shuffle_enabled === true, !!queue),
		"shuffle-on": shuffleKey(player.name, true, true),
		repeat: repeatKey(player.name, queue?.repeat_mode ?? "off", !!queue),
		"repeat-all": repeatKey(player.name, "all", true),
		"repeat-one": repeatKey(player.name, "one", true),
		favourite: heartKey(player.name, false),
		"favourite-on": heartKey(player.name, true),
		"favourite-none": heartKey(player.name, null),
		group: groupKey(player.name, "Kitchen", false, true),
		"group-on": groupKey(player.name, "Kitchen", true, true),
		transfer: transferKey(player.name, "Kitchen", true),
		select: selectKey(player.name, state, player.available, title ? [title, artist ?? ""] : [], { selected: false }),
		"select-on": selectKey(player.name, state, player.available, title ? [title, artist ?? ""] : [], { selected: true }),
		"select-border": selectKey(player.name, state, player.available, title ? [title, artist ?? ""] : [], { selected: false, border: true, position: "2 / 5" }),
		"select-border-on": selectKey(player.name, state, player.available, title ? [title, artist ?? ""] : [], { selected: true, border: true }),
		radio: mediaKey("radio", player.name, radioArt, radio?.name ?? "Choose a station", radio ? "playing" : false, !!radio),
	};
	for (const [name, url] of Object.entries(keys)) write(`${slug}-${name}`, url);
	console.log(`${player.name}: ${state} vol=${level} title=${title} playlist=${playlist?.name}`);
}
process.exit(0);
