import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";

import { fetchServerInfo, normaliseURL } from "./connection";

/**
 * Finds Music Assistant servers on the local network, the way its own apps do: Music
 * Assistant announces itself over mDNS as `_mass._tcp.local`, with its address in a TXT
 * record (`base_url`, plus `name`, `server_version` and `server_id`).
 *
 * Node has no mDNS of its own, so this sends one standard query and reads the answers.
 * The query goes out from an ordinary port, which mDNS responders answer directly
 * ("legacy unicast", RFC 6762 section 6.7), so nothing has to bind port 5353, which the
 * system's own responder usually holds. Every answer is then checked with GET /info, so
 * only servers this computer can actually reach are offered.
 */

const SERVICE = "_mass._tcp.local";
const MDNS = { address: "224.0.0.251", port: 5353 };

export type FoundServer = { url: string; name: string; version: string; id: string };

type Record = { name: string; type: number; data: Buffer; offset: number; message: Buffer };

const TYPE = { A: 1, PTR: 12, TXT: 16, SRV: 33 } as const;

/** Builds a one-question query for the service's PTR records, asking for a direct reply. */
export function buildQuery(id: number, service = SERVICE): Buffer {
	const labels = service.split(".").map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)]));
	const header = Buffer.alloc(12);
	header.writeUInt16BE(id, 0);
	header.writeUInt16BE(1, 4);
	// Type PTR, class IN with the "unicast response" bit.
	const tail = Buffer.from([0, 0, TYPE.PTR, 0x80, 0x01]);
	return Buffer.concat([header, ...labels, tail]);
}

/** Reads a (possibly compressed) DNS name at `offset`; returns it and where it ended. */
function readName(message: Buffer, offset: number, depth = 0): [string, number] {
	const labels: string[] = [];
	let position = offset;
	let end = -1;
	while (position < message.length) {
		const length = message[position];
		if (length === 0) {
			position += 1;
			break;
		}
		if ((length & 0xc0) === 0xc0) {
			if (depth > 10 || position + 1 >= message.length) throw new Error("bad name pointer");
			const pointer = ((length & 0x3f) << 8) | message[position + 1];
			if (end < 0) end = position + 2;
			const [rest] = readName(message, pointer, depth + 1);
			if (rest) labels.push(rest);
			position = -1;
			break;
		}
		labels.push(message.toString("utf8", position + 1, position + 1 + length));
		position += 1 + length;
	}
	return [labels.join("."), end >= 0 ? end : position];
}

/** Splits an mDNS message into its records (answers and additional records alike). */
export function parseRecords(message: Buffer): Record[] {
	if (message.length < 12) return [];
	const questions = message.readUInt16BE(4);
	const total = message.readUInt16BE(6) + message.readUInt16BE(8) + message.readUInt16BE(10);
	let offset = 12;
	for (let i = 0; i < questions; i++) offset = readName(message, offset)[1] + 4;
	const records: Record[] = [];
	for (let i = 0; i < total && offset < message.length; i++) {
		const [name, after] = readName(message, offset);
		const type = message.readUInt16BE(after);
		const length = message.readUInt16BE(after + 8);
		const start = after + 10;
		records.push({ name: name.toLowerCase(), type, data: message.subarray(start, start + length), offset: start, message });
		offset = start + length;
	}
	return records;
}

/** Pulls the servers out of a set of mDNS records. */
export function serversFrom(records: Record[]): Array<{ instance: string; txt: Map<string, string>; host?: string; port?: number; ip?: string }> {
	const instances = records.filter((r) => r.type === TYPE.PTR && r.name === SERVICE.toLowerCase()).map((r) => readName(r.message, r.offset)[0].toLowerCase());
	return [...new Set(instances)].map((instance) => {
		const txt = new Map<string, string>();
		for (const record of records.filter((r) => r.type === TYPE.TXT && r.name === instance)) {
			for (let i = 0; i < record.data.length; ) {
				const length = record.data[i];
				const entry = record.data.toString("utf8", i + 1, i + 1 + length);
				const eq = entry.indexOf("=");
				if (eq > 0) txt.set(entry.slice(0, eq).toLowerCase(), entry.slice(eq + 1));
				i += 1 + length;
			}
		}
		const srv = records.find((r) => r.type === TYPE.SRV && r.name === instance);
		const host = srv ? readName(srv.message, srv.offset + 6)[0].toLowerCase() : undefined;
		const port = srv ? srv.data.readUInt16BE(4) : undefined;
		const a = host ? records.find((r) => r.type === TYPE.A && r.name === host && r.data.length === 4) : undefined;
		const ip = a ? [...a.data].join(".") : undefined;
		return { instance, txt, host, port, ip };
	});
}

/** Sends the query on every local IPv4 interface and gathers answers for `ms`. */
function query(ms: number): Promise<Record[]> {
	return new Promise((resolve) => {
		const records: Record[] = [];
		let socket: Socket;
		try {
			socket = createSocket({ type: "udp4", reuseAddr: true });
		} catch {
			return resolve(records);
		}
		const finish = () => {
			try {
				socket.close();
			} catch {
				// Already closed.
			}
			resolve(records);
		};
		socket.on("error", finish);
		socket.on("message", (message) => {
			try {
				records.push(...parseRecords(message));
			} catch {
				// Not a message we can read; others may be.
			}
		});
		socket.bind(0, () => {
			const query = buildQuery(Math.floor(Math.random() * 0xffff));
			const addresses = Object.values(networkInterfaces())
				.flat()
				.filter((address) => address && address.family === "IPv4" && !address.internal)
				.map((address) => address!.address);
			for (const address of addresses.length ? addresses : [undefined]) {
				try {
					if (address) socket.setMulticastInterface(address);
					socket.send(query, MDNS.port, MDNS.address);
				} catch {
					// An interface that can't send multicast; try the next.
				}
			}
			setTimeout(finish, ms);
		});
	});
}

/**
 * The Music Assistant servers this computer can reach, best first. Each is confirmed with
 * GET /info; an announced address that doesn't answer (a container's own address, say)
 * falls back to the host and port from the service record.
 */
export async function discoverServers(ms = 2500): Promise<FoundServer[]> {
	const found = serversFrom(await query(ms));
	const results = await Promise.all(
		found.map(async (server) => {
			const candidates = [server.txt.get("base_url"), server.ip && server.port ? `http://${server.ip}:${server.port}` : undefined, server.host && server.port ? `http://${server.host.replace(/\.$/, "")}:${server.port}` : undefined].filter((url): url is string => !!url && /^https?:\/\//.test(url));
			for (const candidate of candidates) {
				try {
					const url = normaliseURL(candidate);
					const info = await fetchServerInfo(url, 3000);
					return { url, name: info.name ?? server.txt.get("name") ?? "Music Assistant", version: info.server_version, id: info.server_id };
				} catch {
					// Try the next address for this server.
				}
			}
			return undefined;
		}),
	);
	const unique = new Map<string, FoundServer>();
	for (const result of results) if (result && !unique.has(result.id)) unique.set(result.id, result);
	return [...unique.values()];
}
