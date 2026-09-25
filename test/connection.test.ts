// Runs the Connection against a small fake Music Assistant: the handshake, auth, commands,
// partial results, errors and events, all without a real server.
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

import { WebSocketServer, type WebSocket as ServerSocket } from "ws";

import { Connection, ERROR_CODES, imageURL, isAuthError, normaliseURL } from "../src/ma/connection";

const INFO = { server_id: "abc", server_version: "2.10.4", schema_version: 65, min_supported_schema_version: 28, name: "Test MA", base_url: "http://x" };
let server: Server;
let base = "";
let setupRequired = false;
let oldServer = false;
const sockets = new Set<ServerSocket>();

before(async () => {
	server = createServer((request, response) => {
		if (request.url === "/info") {
			response.writeHead(200, { "content-type": "application/json" });
			return response.end(JSON.stringify(INFO));
		}
		response.writeHead(404);
		response.end();
	});
	const wss = new WebSocketServer({ server, path: "/ws" });
	wss.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		socket.send(JSON.stringify(oldServer ? { ...INFO, schema_version: 27 } : INFO));
		if (setupRequired) {
			socket.send(JSON.stringify({ message_id: "connection", error_code: 503, details: "Setup required" }));
			return socket.close();
		}
		let authed = false;
		socket.on("message", (data) => {
			const { message_id, command, args } = JSON.parse(String(data));
			const send = (body: object) => socket.send(JSON.stringify({ message_id, ...body }));
			if (command === "auth") {
				if (args.token !== "good") return send({ error_code: ERROR_CODES.invalidToken, details: "Invalid or expired token" });
				authed = true;
				return send({ result: { authenticated: true, user: { username: "deck" } } });
			}
			if (!authed && command !== "time") return send({ error_code: ERROR_CODES.authenticationRequired, details: "Authentication required" });
			switch (command) {
				case "time":
					return send({ result: 1_000_000 });
				case "players/all":
					return send({ result: [{ player_id: "p1", name: "Office", playback_state: "playing" }] });
				case "music/playlists/library_items":
					send({ result: [{ name: "A" }, { name: "B" }], partial: true });
					return send({ result: [{ name: "C" }] });
				case "players/cmd/next":
					return send({ error_code: ERROR_CODES.unsupportedFeature, details: "Player does not support next" });
				default:
					return send({ error_code: ERROR_CODES.invalidCommand, details: `Unknown command ${command}` });
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

test("normalises addresses", () => {
	assert.equal(normaliseURL("192.168.1.10"), "http://192.168.1.10:8095");
	assert.equal(normaliseURL("mass.local:8095/"), "http://mass.local:8095");
	assert.equal(normaliseURL("https://ma.example.com/some/path"), "https://ma.example.com");
});

test("reads the server info, authenticates, and runs commands", async () => {
	const connection = new Connection(base, "good");
	const info = await connection.open();
	assert.equal(info.name, "Test MA");
	assert.ok(connection.authenticated);
	const players = await connection.command<Array<{ name: string }>>("players/all");
	assert.equal(players[0].name, "Office");
	assert.equal(await connection.ping(), 1_000_000);
	connection.close();
});

test("joins partial results", async () => {
	const connection = new Connection(base, "good");
	await connection.open();
	const playlists = await connection.command<Array<{ name: string }>>("music/playlists/library_items");
	assert.deepEqual(playlists.map((playlist) => playlist.name), ["A", "B", "C"]);
	connection.close();
});

test("rejects commands the server refuses, with the server's code", async () => {
	const connection = new Connection(base, "good");
	await connection.open();
	await assert.rejects(connection.command("players/cmd/next", { player_id: "p1" }), (error: Error & { code?: number }) => error.code === ERROR_CODES.unsupportedFeature && /next/.test(error.message));
	connection.close();
});

test("a bad token fails open() as an auth error", async () => {
	const connection = new Connection(base, "bad");
	await assert.rejects(connection.open(), (error) => isAuthError(error));
	assert.ok(!connection.connected);
});

test("no token fails before talking to the server", async () => {
	const connection = new Connection(base, undefined);
	await assert.rejects(connection.open(), (error) => isAuthError(error));
});

test("a server still in setup fails open() with its message", async () => {
	setupRequired = true;
	try {
		await assert.rejects(new Connection(base, "good").open(), /Setup required/);
	} finally {
		setupRequired = false;
	}
});

test("a server too old for tokens is refused", async () => {
	oldServer = true;
	try {
		await assert.rejects(new Connection(base, "good").open(), /too old/);
	} finally {
		oldServer = false;
	}
});

test("passes events on and reports the close", async () => {
	const connection = new Connection(base, "good");
	await connection.open();
	const event = new Promise<{ event: string; object_id: string | null }>((resolve) => connection.once("event", resolve));
	const closed = new Promise<string>((resolve) => connection.once("close", resolve));
	for (const socket of sockets) socket.send(JSON.stringify({ event: "player_updated", object_id: "p1", data: { playback_state: "paused" } }));
	assert.deepEqual(await event, { event: "player_updated", object_id: "p1", data: { playback_state: "paused" } });
	for (const socket of sockets) socket.close(1000, "bye");
	assert.equal(await closed, "bye");
});

test("builds image URLs the proxy accepts", () => {
	assert.equal(imageURL("http://x:8095", { type: "thumb", path: "/tmp/a.jpg", provider: "filesystem", proxy_id: "ff" }, 256), "http://x:8095/imageproxy/ff?size=256");
	assert.equal(imageURL("http://x:8095", { type: "thumb", path: "https://cdn/a.jpg", provider: "spotify", remotely_accessible: true }), "https://cdn/a.jpg");
	assert.equal(imageURL("http://x:8095", { type: "thumb", path: "/tmp/a.jpg", provider: "filesystem" }), undefined);
});
