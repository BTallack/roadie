// Connects to a real Music Assistant and prints what the plugin will see: server, players,
// queues and playlists. Read-only.
// Usage: MA_URL=192.168.1.10:8095 MA_TOKEN=... npx tsx scripts/probe.ts
import { Connection, fetchServerInfo, imageURL, normaliseURL } from "../src/ma/connection";
import { itemImage, type Player, type PlayerQueue, type Playlist } from "../src/ma/types";

const base = normaliseURL(process.env.MA_URL ?? "mass.local:8095");
const info = await fetchServerInfo(base);
console.log(`${info.name ?? "Music Assistant"} ${info.server_version} (schema ${info.schema_version}, min ${info.min_supported_schema_version}) at ${info.internal_url ?? base}`);
if (!process.env.MA_TOKEN) {
	console.log("Set MA_TOKEN to a long-lived token (Music Assistant: Settings, Profile, Long-lived access tokens) to list players and playlists.");
	process.exit(0);
}

const connection = new Connection(base, process.env.MA_TOKEN, { info: console.log, warn: console.warn });
connection.on("event", (event) => console.log(`  event ${event.event} ${event.object_id ?? ""}`));
await connection.open();

const players = await connection.command<Player[]>("players/all", { return_unavailable: true, return_disabled: false });
console.log(`\n${players.length} players:`);
for (const player of players.sort((a, b) => a.name.localeCompare(b.name))) {
	const media = player.current_media;
	const flags = [player.available ? "" : "unavailable", player.hide_in_ui ? "hidden" : "", player.private ? "private" : "", player.type !== "player" ? player.type : ""].filter(Boolean).join(", ");
	console.log(`  ${player.name} [${player.player_id}] ${player.playback_state} vol=${player.volume_level ?? "-"}${player.volume_muted ? " muted" : ""} power=${player.powered ?? "-"} source=${player.active_source ?? "-"}${flags ? ` (${flags})` : ""}`);
	if (media?.title) console.log(`      ${media.title}${media.artist ? ` · ${media.artist}` : ""}`);
	console.log(`      features: ${player.supported_features.join(" ")}`);
}

const queues = await connection.command<PlayerQueue[]>("player_queues/all");
console.log(`\n${queues.length} queues:`);
for (const queue of queues) {
	const from = (queue.sources ?? queue.radio_source ?? []).map((source) => `${source.name} <${source.uri}>`).join(", ");
	console.log(`  ${queue.display_name} [${queue.queue_id}] ${queue.state}${queue.active ? " active" : ""} ${queue.items} items shuffle=${queue.shuffle_enabled} repeat=${queue.repeat_mode}${from ? ` from ${from}` : ""}`);
	if (queue.current_item) console.log(`      now: ${queue.current_item.name} (${Math.round(queue.elapsed_time)}/${queue.current_item.duration ?? "?"} s) art=${imageURL(base, itemImage(queue.current_item.media_item ?? queue.current_item)) ?? "-"}`);
}

const playlists = await connection.command<Playlist[]>("music/playlists/library_items", { limit: 200, order_by: "sort_name" });
console.log(`\n${playlists.length} playlists (first 200):`);
for (const playlist of playlists) {
	console.log(`  ${playlist.name}${playlist.owner ? ` (${playlist.owner})` : ""} <${playlist.uri}>${playlist.favorite ? " ★" : ""} art=${imageURL(base, itemImage(playlist)) ?? "-"}`);
}

console.log(`\nserver time offset: ${Math.round((Date.now() / 1000 - (await connection.ping())) * 1000)} ms`);
console.log("\nListening for events for 10 s (play or pause something)…");
await new Promise((resolve) => setTimeout(resolve, 10_000));
connection.close();
