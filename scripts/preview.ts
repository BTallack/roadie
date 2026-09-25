// Connects the plugin's Session to a real Music Assistant (read-only) and writes every key
// for a few players to .preview/, so the drawings can be checked without the hardware.
// Usage: MA_URL=... MA_TOKEN=... npx tsx scripts/preview.ts [player name…]
import { writeFileSync } from "node:fs";

import { Session } from "../src/ma/session";
import { nowPlayingKey, playPauseKey, playlistKey, transportKey, volumeKey, messageKey } from "../src/render";
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
	const playlist = source?.uri ? await session.playlist(source.uri) : undefined;
	const playlistArt = playlist ? await session.artwork(playlist) : undefined;
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
		"volume-up-icon": volumeKey(null, level, muted, "up", false),
		"volume-up-noname": volumeKey(null, level, muted, "up"),
		"nowplaying-art": nowPlayingKey(null, art, { title, artist, state, available: player.available, progress: session.progress(queue), caption: false }),
		"playpause-noname": playPauseKey(null, state, canTransport(player, queue, "pause")),
		"stop-icon": transportKey("stop", null, state !== "idle", false),
		playlist: playlistKey(player.name, playlistArt, playlist?.name ?? "Choose a playlist", playlist ? (state === "playing" ? "playing" : "loaded") : false, !!playlist),
		"playlist-noname": playlistKey(null, playlistArt, playlist?.name ?? "Choose a playlist", false, !!playlist),
		"playlist-art": playlistKey(null, playlistArt, null, false, !!playlist),
	};
	for (const [name, url] of Object.entries(keys)) write(`${slug}-${name}`, url);
	console.log(`${player.name}: ${state} vol=${level} title=${title} playlist=${playlist?.name}`);
}
process.exit(0);
