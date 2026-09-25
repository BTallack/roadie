import { EventEmitter } from "node:events";

import type { MassEvent, MediaItemImage, ServerInfo } from "./types";

/**
 * One WebSocket to a user's own Music Assistant server. Nothing here goes anywhere else.
 *
 * The wire format (see docs/music-assistant-api.md): the server speaks first with its
 * info; the client's first command must be `auth` with a long-lived token; after that
 * commands are `{ message_id, command, args }` answered by `{ message_id, result }` or
 * `{ message_id, error_code, details }`, and the server pushes `{ event, object_id, data }`
 * for anything that changes. Large results arrive in `partial: true` pieces.
 *
 * This class does one connection and nothing more: no retries, no state. The session
 * layer above it decides when to reconnect.
 */

export class MusicAssistantError extends Error {
	constructor(
		message: string,
		/** Music Assistant's error code (`ERROR_CODES`), or undefined for local failures. */
		readonly code?: number,
	) {
		super(message);
	}
}

/** The server's error codes the plugin tells apart. */
export const ERROR_CODES = {
	unsupportedFeature: 9,
	playerUnavailable: 10,
	playerCommandFailed: 11,
	invalidCommand: 12,
	authenticationRequired: 20,
	authenticationFailed: 21,
	insufficientPermissions: 22,
	invalidToken: 23,
} as const;

/** Errors that mean the token, not the network, is the problem. */
export function isAuthError(error: unknown): boolean {
	return error instanceof MusicAssistantError && (error.code === ERROR_CODES.authenticationRequired || error.code === ERROR_CODES.authenticationFailed || error.code === ERROR_CODES.invalidToken || error.code === ERROR_CODES.insufficientPermissions);
}

/** Servers before this schema have no user accounts or tokens; the plugin needs both. */
export const MIN_SCHEMA = 28;

type Logger = { info(message: string): void; warn(message: string): void };

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout; partial?: unknown[] };

export class Connection extends EventEmitter {
	private socket?: WebSocket;
	private pending = new Map<string, Pending>();
	private counter = 0;
	serverInfo?: ServerInfo;
	/** Set once `auth` succeeded. */
	authenticated = false;
	/** A refusal the server sent on its own (no users yet), kept so open() can report it. */
	private refusal?: MusicAssistantError;

	constructor(
		readonly base: string,
		private readonly token: string | undefined,
		private readonly log: Logger = { info() {}, warn() {} },
	) {
		super();
	}

	get connected(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	/**
	 * Opens the socket, reads the server's info, authenticates, and resolves with the info.
	 * Rejects (and closes) on any failure. `open()` is a one-shot: make a new Connection to retry.
	 */
	async open(timeoutMs = 15_000): Promise<ServerInfo> {
		if (this.socket) throw new MusicAssistantError("Already opened");
		const socket = new WebSocket(socketURL(this.base));
		this.socket = socket;
		const info = await new Promise<ServerInfo>((resolve, reject) => {
			const timer = setTimeout(() => fail(new MusicAssistantError("Music Assistant didn't answer")), timeoutMs);
			const fail = (error: Error) => {
				clearTimeout(timer);
				socket.onmessage = null;
				reject(error);
			};
			socket.onerror = () => fail(new MusicAssistantError("Can't reach Music Assistant"));
			socket.onclose = (event) => fail(new MusicAssistantError(event.reason || "Music Assistant closed the connection"));
			socket.onmessage = (event) => {
				const raw = parse(String(event.data));
				if (!raw) return;
				if (typeof raw.server_id === "string" && typeof raw.schema_version === "number") {
					clearTimeout(timer);
					resolve(raw as unknown as ServerInfo);
				} else if (raw.error_code !== undefined) {
					// Sent right after the info when the server has no users yet (503), often in the
					// same packet, so it's kept for open() to report once the close follows.
					this.refusal = new MusicAssistantError(String(raw.details ?? "Music Assistant refused the connection"), Number(raw.error_code));
					fail(this.refusal);
				}
			};
		}).catch((error) => {
			this.dispose();
			throw error;
		});
		this.serverInfo = info;
		// From here on the normal message handler runs.
		socket.onmessage = (event) => this.handle(String(event.data));
		socket.onclose = (event) => this.closed(event.reason || "connection closed");
		socket.onerror = () => {};
		if (info.schema_version < MIN_SCHEMA) {
			this.dispose();
			throw new MusicAssistantError(`Music Assistant ${info.server_version} is too old: update to a version with user accounts (API schema ${MIN_SCHEMA} or later)`);
		}
		if (!this.token) {
			this.dispose();
			throw new MusicAssistantError("Music Assistant needs a long-lived token", ERROR_CODES.authenticationRequired);
		}
		try {
			const result = await this.command<{ authenticated?: boolean }>("auth", { token: this.token });
			if (!result?.authenticated) throw new MusicAssistantError("Music Assistant rejected the token", ERROR_CODES.invalidToken);
		} catch (error) {
			this.dispose();
			// A server with no users answers the info with a 503 and closes before auth can run.
			throw this.refusal ?? error;
		}
		this.authenticated = true;
		this.log.info(`connected to ${info.name ?? info.server_id} (${info.server_version}, schema ${info.schema_version})`);
		return info;
	}

	/** Sends a command and resolves with its result, joining partial results. */
	command<T = unknown>(command: string, args?: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
		const socket = this.socket;
		if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new MusicAssistantError("Not connected to Music Assistant"));
		const message_id = String(++this.counter);
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(message_id);
				reject(new MusicAssistantError(`Music Assistant didn't answer ${command}`));
			}, timeoutMs);
			this.pending.set(message_id, { resolve: resolve as (value: unknown) => void, reject, timer });
			// Music Assistant reads absent args as their defaults; undefined never serialises anyway.
			socket.send(JSON.stringify({ message_id, command, args: args ?? {} }));
		});
	}

	/** Round-trips the unauthenticated `time` command, as a liveness check. */
	async ping(timeoutMs = 10_000): Promise<number> {
		return this.command<number>("time", undefined, timeoutMs);
	}

	close(): void {
		this.dispose();
		this.closed("closed");
	}

	private handle(text: string): void {
		const raw = parse(text);
		if (!raw) return;
		if (typeof raw.event === "string") {
			this.emit("event", { event: raw.event, object_id: raw.object_id ?? null, data: raw.data } as MassEvent);
			return;
		}
		const id = raw.message_id === undefined ? undefined : String(raw.message_id);
		const pending = id === undefined ? undefined : this.pending.get(id);
		if (!pending || id === undefined) {
			if (raw.error_code !== undefined && !this.authenticated) this.refusal = new MusicAssistantError(String(raw.details ?? "Music Assistant refused the connection"), Number(raw.error_code));
			return;
		}
		if (raw.error_code !== undefined) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(new MusicAssistantError(String(raw.details ?? `Music Assistant error ${raw.error_code}`), Number(raw.error_code)));
			return;
		}
		if (raw.partial === true) {
			(pending.partial ??= []).push(...(Array.isArray(raw.result) ? raw.result : [raw.result]));
			return;
		}
		clearTimeout(pending.timer);
		this.pending.delete(id);
		if (pending.partial) pending.resolve([...pending.partial, ...(Array.isArray(raw.result) ? raw.result : [raw.result])]);
		else pending.resolve(raw.result);
	}

	private closed(reason: string): void {
		const wasOpen = !!this.socket;
		this.dispose();
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new MusicAssistantError(reason));
			this.pending.delete(id);
		}
		if (wasOpen) this.emit("close", reason);
	}

	private dispose(): void {
		const socket = this.socket;
		this.socket = undefined;
		this.authenticated = false;
		if (!socket) return;
		socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
		try {
			socket.close();
		} catch {
			// Already closed.
		}
	}
}

function parse(text: string): Record<string, unknown> | undefined {
	try {
		const value = JSON.parse(text);
		return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

/** Origin only, no path or trailing slash; `http://` and port 8095 assumed when missing. */
export function normaliseURL(input: string): string {
	let text = input.trim();
	if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
	const url = new URL(text);
	if (!url.port && url.protocol === "http:") url.port = "8095";
	return `${url.protocol}//${url.host}`;
}

export function socketURL(base: string): string {
	const url = new URL(`${base}/ws`);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

/** GET /info: no token needed, so the settings panel can check an address before asking for one. */
export async function fetchServerInfo(base: string, timeoutMs = 8_000): Promise<ServerInfo> {
	let response: Response;
	try {
		response = await fetch(`${base}/info`, { signal: AbortSignal.timeout(timeoutMs) });
	} catch (error) {
		const reason = error instanceof Error ? (error.name === "TimeoutError" ? "timed out" : error.message) : String(error);
		throw new MusicAssistantError(`Can't reach Music Assistant (${reason})`);
	}
	if (!response.ok) throw new MusicAssistantError(`Music Assistant answered HTTP ${response.status}`);
	const info = (await response.json()) as Partial<ServerInfo>;
	if (typeof info.server_id !== "string" || typeof info.schema_version !== "number") throw new MusicAssistantError("That isn't a Music Assistant server");
	return info as ServerInfo;
}

/** Sizes the image proxy accepts; 0 is the original. */
export const IMAGE_SIZES = [0, 80, 160, 256, 512, 1024] as const;

/**
 * Where to fetch an image: the server's proxy for anything with a `proxy_id` (schema 31+),
 * the image's own URL when it's public, otherwise nothing.
 */
export function imageURL(base: string, image: MediaItemImage | undefined, size: (typeof IMAGE_SIZES)[number] = 160): string | undefined {
	if (!image) return undefined;
	if (image.proxy_id) return `${base}/imageproxy/${image.proxy_id}?size=${size}`;
	if (image.remotely_accessible && /^https?:\/\//.test(image.path)) return image.path;
	return undefined;
}
