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
			const { message_id, command } = JSON.parse(String(data));
			const send = (result: unknown) => socket.send(JSON.stringify({ message_id, result }));
			switch (command) {
				case "auth":
					return send({ authenticated: true });
				case "time":
					return send(Date.now() / 1000 + 100);
				case "players/all":
					return send([player("Office"), player("Kitchen", { synced_to: "Office", hide_in_ui: true }), player("Web", { private: true }), player("Everywhere", { type: "group", volume_level: null, group_volume: 30, supported_features: [] })]);
				case "player_queues/all":
					return send([queue("Office", { state: "playing", sources: [{ uri: "library://playlist/17", name: "Mix" }], current_item: { queue_id: "Office", queue_item_id: "x", name: "Song", duration: 200 }, elapsed_time: 50, elapsed_time_last_updated: Date.now() / 1000 + 100 }), queue("Kitchen"), queue("Everywhere")]);
				case "providers":
					return send([{ instance_id: "spotify--1", name: "Spotify", type: "music" }, { instance_id: "apple--1", name: "Apple Music", type: "music" }, { instance_id: "tunein--1", name: "Tune-In Radio", type: "music" }]);
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
	assert.equal(session.players.size, 4);
	assert.deepEqual(session.playerList().map((p) => p.name), ["Everywhere", "Office"]);
	assert.deepEqual(session.playerList(true).map((p) => p.name), ["Everywhere", "Kitchen", "Office"]);
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

test("reconnects after the server drops the socket", async () => {
	const session = new Session(quiet);
	session.configure(base, "good");
	await until(() => session.state === "live");
	for (const socket of sockets) socket.close(1012, "restart");
	await until(() => session.state === "offline");
	assert.equal(session.players.size, 4, "keeps the last state while offline");
	await until(() => session.state === "live", 8000);
	session.configure(undefined, undefined);
});

test("a wrong address is offline, not a crash", async () => {
	const session = new Session(quiet);
	session.configure("http://127.0.0.1:1", "good");
	await until(() => session.state === "offline");
	assert.match(session.lastError ?? "", /Can't reach/);
	session.configure(undefined, undefined);
});
