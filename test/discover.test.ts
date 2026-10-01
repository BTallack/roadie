// The mDNS reader, against answers built the way responders send them: the instance name
// written once and pointed back to (DNS name compression) from the TXT and SRV records.
import assert from "node:assert/strict";
import test from "node:test";

import { buildQuery, parseRecords, serversFrom } from "../src/ma/discover";

/** Writes a DNS name as labels; `pointer` ends it with a compression pointer instead of a zero. */
function name(text: string, pointer?: number): Buffer {
	const parts = text ? text.split(".").map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])) : [];
	return Buffer.concat([...parts, pointer === undefined ? Buffer.from([0]) : Buffer.from([0xc0 | (pointer >> 8), pointer & 0xff])]);
}

function record(owner: Buffer, type: number, data: Buffer): Buffer {
	const head = Buffer.alloc(10);
	head.writeUInt16BE(type, 0);
	head.writeUInt16BE(0x8001, 2);
	head.writeUInt32BE(120, 4);
	head.writeUInt16BE(data.length, 8);
	return Buffer.concat([owner, head, data]);
}

function txt(entries: string[]): Buffer {
	return Buffer.concat(entries.map((entry) => Buffer.concat([Buffer.from([entry.length]), Buffer.from(entry)])));
}

/** An answer as Music Assistant's responder sends it, with compression throughout. */
function answer(): Buffer {
	const header = Buffer.alloc(12);
	header.writeUInt16BE(0x8400, 2);
	header.writeUInt16BE(1, 6); // one answer
	header.writeUInt16BE(3, 10); // three additional
	const serviceAt = 12;
	const service = name("_mass._tcp.local");
	const ptrHead = 12 + service.length;
	const instanceAt = ptrHead + 10;
	const ptr = record(service, 12, name("abc123", serviceAt));
	const txtRecord = record(Buffer.from([0xc0, instanceAt]), 16, txt(["server_id=abc123", "server_version=2.10.4", "base_url=http://192.168.1.10:8095", "name=Music Assistant"]));
	const srvData = Buffer.alloc(6);
	srvData.writeUInt16BE(8095, 4);
	const hostName = name("mass.local");
	const srvRecord = record(Buffer.from([0xc0, instanceAt]), 33, Buffer.concat([srvData, hostName]));
	const hostAt = 12 + service.length + 10 + (ptr.length - service.length - 10) + txtRecord.length + 2 + 10 + 6;
	const aRecord = record(Buffer.from([0xc0 | (hostAt >> 8), hostAt & 0xff]), 1, Buffer.from([192, 168, 1, 10]));
	return Buffer.concat([header, ptr, txtRecord, srvRecord, aRecord]);
}

test("builds a PTR query for the service that asks for a direct reply", () => {
	const query = buildQuery(0x1234);
	assert.equal(query.readUInt16BE(0), 0x1234);
	assert.equal(query.readUInt16BE(4), 1);
	assert.ok(query.includes(Buffer.from("\x05_mass\x04_tcp\x05local\x00", "latin1")));
	assert.deepEqual([...query.subarray(-4)], [0, 12, 0x80, 0x01]);
});

test("reads the server's address, port and details from a compressed answer", () => {
	const [server] = serversFrom(parseRecords(answer()));
	assert.equal(server.instance, "abc123._mass._tcp.local");
	assert.equal(server.txt.get("base_url"), "http://192.168.1.10:8095");
	assert.equal(server.txt.get("server_version"), "2.10.4");
	assert.equal(server.host, "mass.local");
	assert.equal(server.port, 8095);
	assert.equal(server.ip, "192.168.1.10");
});

test("ignores other services and survives garbage", () => {
	assert.deepEqual(serversFrom(parseRecords(buildQuery(1, "_http._tcp.local"))), []);
	assert.doesNotThrow(() => parseRecords(Buffer.from([1, 2, 3])));
	assert.deepEqual(parseRecords(Buffer.alloc(4)), []);
});
