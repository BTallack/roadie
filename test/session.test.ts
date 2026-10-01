// Runs the Session against a fake Music Assistant: loading state, following events,
// resolving a player's queue through sync leaders, playlist choices, and reconnecting.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

import { WebSocketServer, type WebSocket as ServerSocket } from "ws";

import { Session } from "../src/ma/session";

const INFO = { server_id: "abc", server_version: "2.10.4", schema_version: 65, min_supported_schema_version: 28, name: "Test MA" };
const player = (id: string, extra: Record<string, unknown> = {}) => ({ player_id: id, provider: "sonos", type: "player", name: id, available: true, supported_features: ["pause", "next_previous", "volume_set"], playback_state: "idle", volume_level: 20, active_source: id, ...extra });
const queue = (id: string, extra: Record<string, unknown> = {}) => ({ queue_id: id, active: true, display_name: id, available: true, items: 0, shuffle_enabled: false, repeat_mode: "off", state: "idle", elapsed_time: 0, elapsed_time_last_updated: 0, ...extra });

let server: Server;
const artistPages: Array<{ limit?: number; offset?: number }> = [];
let base = "";
const sockets = new Set<ServerSocket>();

before(async () => {
	server = createServer((request, response) => {
		response.writeHead(request.url === "/info" ? 200 : 404, { "content-type": "application/json" });
		response.end(JSON.stringify(INFO));
	});
	const wss = new WebSocketServer({ server, path: "/ws" });
	wss.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.send(JSON.stringify(INFO));
		socket.on("message", (data) => {
			const { message_id, command, args } = JSON.parse(String(data));
			const send = (result: unknown) => socket.send(JSON.stringify({ message_id, result }));
			switch (command) {
				case "auth":
					if (args.token !== "good") return socket.send(JSON.stringify({ message_id, error_code: 23, details: "Invalid or expired token" }));
					return send({ authenticated: true, user: { username: "deck", role: "guest" } });
				case "time":
					return send(Date.now() / 1000 + 100);
				case "players/all":
					return send([player("Office", { can_group_with: ["sonos"], group_members: ["Office", "Kitchen"] }), player("Kitchen", { synced_to: "Office", hide_in_ui: true, can_group_with: ["sonos"] }), player("Web", { private: true }), player("Everywhere", { type: "group", provider: "player_group", volume_level: null, group_volume: 30, supported_features: [], group_members: ["Office", "Kitchen", "Bath"] }), player("Bath", { can_group_with: ["sonos"] })]);
				case "player_queues/all":
					return send([queue("Office", { state: "playing", sources: [{ uri: "library://playlist/17", name: "Mix" }], current_item: { queue_id: "Office", queue_item_id: "x", name: "Song", duration: 200 }, elapsed_time: 50, elapsed_time_last_updated: Date.now() / 1000 + 100 }), queue("Kitchen"), queue("Everywhere")]);
				case "providers":
					return send([{ instance_id: "spotify--1", name: "Spotify", type: "music" }, { instance_id: "apple--1", name: "Apple Music", type: "music" }, { instance_id: "tunein--1", name: "Tune-In Radio", type: "music" }]);
				case "music/albums/library_items":
					return send([{ name: "Rumours", uri: "library://album/3", provider: "library", artists: [{ name: "Fleetwood Mac" }], provider_mappings: [{ item_id: "x", provider_domain: "spotify", provider_instance: "spotify--1" }] }]);
				case "music/artists/library_items": {
					// 1,203 artists, served a page at a time like the real server, searchable.
					artistPages.push(args);
					if (args.search) return send([{ name: "Fleetwood Mac", uri: "library://artist/9", provider: "library", favorite: true, provider_mappings: [] }].filter((a) => a.name.toLowerCase().includes(String(args.search).toLowerCase())));
					const all = Array.from({ length: 1203 }, (_, i) => ({ name: i === 0 ? "Fleetwood Mac" : `Artist ${String(i).padStart(4, "0")}`, uri: `library://artist/${i + 9}`, provider: "library", favorite: i === 0, provider_mappings: [{ item_id: `y${i}`, provider_domain: "spotify", provider_instance: "spotify--1" }] }));
					return send(all.slice(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 500)));
				}
				case "music/radios/library_items":
					return send([
						{ name: "Bass Jazz", uri: "library://radio/241", provider: "library", favorite: true, provider_mappings: [{ item_id: "jazzradio:bassjazz", provider_domain: "digitally_incorporated", provider_instance: "digitally_incorporated" }] },
						{ name: "Ambient", uri: "library://radio/12", provider: "library", provider_mappings: [{ item_id: "zenradio:ambient", provider_domain: "digitally_incorporated", provider_instance: "digitally_incorporated" }, { item_id: "di:ambient", provider_domain: "digitally_incorporated", provider_instance: "digitally_incorporated" }] },
						{ name: "CBC Radio One", uri: "library://radio/5", provider: "library", provider_mappings: [{ item_id: "s1234", provider_domain: "tunein", provider_instance: "tunein--1" }] },
					]);
				case "music/playlists/library_items":
					socket.send(JSON.stringify({ message_id, result: [{ name: "Hamilton", uri: "library://playlist/24", provider: "library", favorite: true, provider_mappings: [{ item_id: "a", provider_domain: "spotify", provider_instance: "spotify--1" }] }], partial: true }));
					return send([{ name: "Hamilton", uri: "library://playlist/79", provider: "library", provider_mappings: [{ item_id: "b", provider_domain: "apple_music", provider_instance: "apple--1" }] }]);
				default:
					return send(null);
			}
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

after(() => {
	for (const socket of sockets) socket.terminate();
	server.close();
});

const quiet = { info: () => {}, warn: () => {} };

async function until(check: () => boolean, ms = 5000): Promise<void> {
	const deadline = Date.now() + ms;
	while (Date.now() < deadline && !check()) await new Promise((resolve) => setTimeout(resolve, 20));
	assert.ok(check(), "condition met");
}

test("loads players, queues and providers, then goes live", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	assert.equal(session.players.size, 5);
	assert.deepEqual(session.playerList().map((p) => p.name), ["Bath", "Everywhere", "Office"]);
	assert.deepEqual(session.playerList(true).map((p) => p.name), ["Bath", "Everywhere", "Kitchen", "Office"]);
	assert.equal(session.user?.role, "guest");
	assert.ok(Math.abs(session.clockOffset - 100) < 2, "clock offset from the time command");
	session.configure(undefined, undefined);
});

test("resolves a synced player's queue through its leader, and progress moves", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	const kitchen = session.queueFor(session.player("Kitchen"));
	assert.equal(kitchen?.queue_id, "Office");
	const progress = session.progress(kitchen);
	assert.ok(progress !== null && progress >= 0.25 && progress < 0.3, `progress ${progress}`);
	session.configure(undefined, undefined);
});

test("follows events", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	const changed = new Promise<void>((resolve) => session.once("change", () => resolve()));
	for (const socket of sockets) socket.send(JSON.stringify({ event: "player_updated", object_id: "Office", data: player("Office", { playback_state: "paused", volume_level: 55 }) }));
	await changed;
	assert.equal(session.player("Office")?.volume_level, 55);
	for (const socket of sockets) socket.send(JSON.stringify({ event: "queue_time_updated", object_id: "Office", data: 120 }));
	await until(() => session.queues.get("Office")?.elapsed_time === 120);
	session.configure(undefined, undefined);
});

test("names the provider on playlists and sorts by name then provider", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	const playlists = await session.playlists();
	assert.deepEqual(playlists.map((p) => `${p.name} (${p.group})${p.favorite ? "*" : ""}`), ["Hamilton (Apple Music)", "Hamilton (Spotify)*"]);
	session.configure(undefined, undefined);
});

test("groups radio stations by network, listing multi-network stations under each", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	const radios = await session.radios();
	assert.deepEqual(radios.map((r) => `${r.name} (${r.group})${r.favorite ? "*" : ""}`), ["Ambient (DI.FM)", "Ambient (ZenRadio)", "Bass Jazz (JazzRadio)*", "CBC Radio One (Tune-In Radio)"]);
	session.configure(undefined, undefined);
});

test("labels albums with their artist and lists artists for artist radio", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	assert.deepEqual((await session.albums()).map((a) => `${a.label} [${a.group}]`), ["Rumours — Fleetwood Mac [Spotify]"]);
	artistPages.length = 0;
	const artists = await session.artists();
	assert.equal(artists.length, 1203, "every page fetched");
	assert.deepEqual(artistPages.map((p) => `${p.offset}+${p.limit}`), ["0+500", "500+500", "1000+500"], "in pages of 500");
	assert.ok(artists.some((a) => a.name === "Fleetwood Mac" && a.favorite && a.uri === "library://artist/9"));
	artistPages.length = 0;
	assert.deepEqual((await session.artists("fleet")).map((a) => a.name), ["Fleetwood Mac"], "search goes to the server");
	assert.equal((artistPages[0] as { search?: string }).search, "fleet");
	assert.deepEqual(await session.artists("zzz"), []);
	session.configure(undefined, undefined);
});

test("each deck has its own selected player; an old shared selection is where decks start", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	assert.equal(session.player("selected", "deckA"), undefined);
	let changes = 0;
	session.on("selected", () => changes++);
	session.select("Office", "deckA");
	session.select("Office", "deckA");
	assert.equal(changes, 1);
	assert.equal(session.player("selected", "deckA")?.name, "Office");
	assert.equal(session.player("selected", "deckB"), undefined, "another deck is unaffected");
	session.restoreSelection({ deckA: "Bath", deckB: "Bath" }, "Everywhere");
	assert.equal(session.player("selected", "deckA")?.name, "Office", "a selection made since a save isn't undone by it");
	assert.equal(session.player("selected", "deckB")?.name, "Bath");
	assert.equal(session.player("selected", "deckC")?.name, "Everywhere", "decks without a choice start from the old shared one");
	assert.deepEqual(session.selections(), { deckA: "Office", deckB: "Bath" });
	session.configure(undefined, undefined);
});

test("grouping reads live sync state, never a group player's saved members", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	const [office, kitchen, bath, everywhere] = ["Office", "Kitchen", "Bath", "Everywhere"].map((id) => session.player(id)!);
	assert.ok(session.isGrouped(kitchen, office), "synced to it");
	assert.ok(!session.isGrouped(office, kitchen));
	assert.ok(!session.isGrouped(bath, everywhere), "a member of a group player isn't grouped until the group plays");
	assert.deepEqual(session.groupTargets(bath).map((p) => p.name), ["Kitchen", "Office"], "real players only, no group players");
	session.configure(undefined, undefined);
});

test("a refused token stops retrying and forgets the players", async () => {
	const session = new Session(quiet);
	session.configure(base, "bad");
	await until(() => session.state === "unauthorized");
	assert.equal(session.players.size, 0);
	assert.match(session.lastError ?? "", /Invalid or expired token/);
	session.configure(undefined, undefined);
});

test("a pasted token with the header's Bearer prefix still works", async () => {
	const session = new Session(quiet);
	session.configure(base, "Bearer good ");
	await until(() => session.state === "live");
	session.configure(undefined, undefined);
});

test("reconnects after the server drops the socket", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	for (const socket of sockets) socket.close(1012, "restart");
	await until(() => session.state === "offline");
	assert.equal(session.players.size, 5, "keeps the last state while offline");
	await until(() => session.state === "live", 8000);
	session.configure(undefined, undefined);
});

test("an address that answers but isn't Music Assistant says so", async () => {
	const other = createServer((_request, response) => {
		response.writeHead(200, { "content-type": "text/html" });
		response.end("<html>Home Assistant</html>");
	});
	await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
	const address = other.address();
	const session = new Session(quiet);
	session.configure(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`, "good");
	await until(() => session.state === "offline");
	assert.match(session.lastError ?? "", /isn't Music Assistant.*8095/);
	session.configure(undefined, undefined);
	other.close();
});

test("a wrong address is offline, not a crash", async () => {
	const session = new Session(quiet);
	session.configure("http://127.0.0.1:1", "good");
	await until(() => session.state === "offline");
	assert.match(session.lastError ?? "", /Can't reach/);
	session.configure(undefined, undefined);
});
