/**
 * Yjs sync over WebSocket, speaking the y-websocket wire protocol (y-protocols sync + awareness).
 *
 *   /ws/<token>  ->  {treeId, role}
 *
 * View-role sockets may ask for the document (sync step 1) and share presence, but any document
 * change they send (sync step 2 or update) is dropped here. The server is the authority.
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { getDb } from './db.ts';
import { resolveToken, type Role } from './trees.ts';
import { maybeSnapshot } from './history.ts';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_QUERY_AWARENESS = 3;

export const LIMITS = {
	/** largest single WebSocket message */
	maxMessage: 1024 * 1024,
	/** largest stored document */
	maxDoc: 2 * 1024 * 1024,
	persistDebounceMs: Number(process.env.PERSIST_DEBOUNCE_MS || 1000),
	persistMaxWaitMs: 5000,
	evictAfterMs: Number(process.env.EVICT_AFTER_MS || 60_000),
	pingMs: 30_000
};

/** Close codes the client understands. */
export const CLOSE = { revoked: 4001, unknown: 4004, tooLarge: 4013 } as const;

interface Conn {
	ws: WebSocket;
	role: Role;
	tokenHash: string;
	clientIds: Set<number>;
	alive: boolean;
}

interface Shared {
	id: string;
	doc: Y.Doc;
	awareness: awarenessProtocol.Awareness;
	conns: Map<WebSocket, Conn>;
	dirty: boolean;
	firstDirtyAt: number;
	persistTimer: ReturnType<typeof setTimeout> | null;
	evictTimer: ReturnType<typeof setTimeout> | null;
	size: number;
}

type State = { docs: Map<string, Shared>; wss: WebSocketServer | null; pinger: ReturnType<typeof setInterval> | null };
const STATE_KEY = Symbol.for('values-tree.sync');
const g = globalThis as typeof globalThis & { [STATE_KEY]?: State; __valuesTree?: unknown };
const state: State = (g[STATE_KEY] ??= { docs: new Map(), wss: null, pinger: null });

function send(conn: Conn, msg: Uint8Array) {
	if (conn.ws.readyState !== WebSocket.OPEN) return;
	conn.ws.send(msg, (err) => {
		if (err) conn.ws.terminate();
	});
}

function persist(s: Shared) {
	if (s.persistTimer) clearTimeout(s.persistTimer);
	s.persistTimer = null;
	if (!s.dirty) return;
	s.dirty = false;
	const update = Y.encodeStateAsUpdate(s.doc);
	s.size = update.length;
	const meta = s.doc.getMap('meta');
	const t = meta.get('title');
	const title = t instanceof Y.Text ? t.toString() : '';
	try {
		getDb().saveState(s.id, update, title);
	} catch (err) {
		console.error('[sync] failed to persist tree', s.id, err);
		s.dirty = true;
		return;
	}
	maybeSnapshot(s.id, s.doc);
}

function schedulePersist(s: Shared) {
	const now = Date.now();
	if (!s.dirty) {
		s.dirty = true;
		s.firstDirtyAt = now;
	}
	if (s.persistTimer) clearTimeout(s.persistTimer);
	const wait = Math.max(0, Math.min(LIMITS.persistDebounceMs, s.firstDirtyAt + LIMITS.persistMaxWaitMs - now));
	s.persistTimer = setTimeout(() => persist(s), wait);
}

function getShared(treeId: string): Shared {
	let s = state.docs.get(treeId);
	if (s) {
		if (s.evictTimer) clearTimeout(s.evictTimer);
		s.evictTimer = null;
		return s;
	}
	const doc = new Y.Doc({ gc: true });
	const stored = getDb().loadState(treeId);
	if (stored) {
		Y.applyUpdate(doc, stored);
		// the state people are about to start editing from
		maybeSnapshot(treeId, doc);
	}
	const awareness = new awarenessProtocol.Awareness(doc);
	awareness.setLocalState(null);
	const shared: Shared = {
		id: treeId,
		doc,
		awareness,
		conns: new Map(),
		dirty: false,
		firstDirtyAt: 0,
		persistTimer: null,
		evictTimer: null,
		size: stored?.length ?? 0
	};
	s = shared;
	doc.on('update', (update: Uint8Array, origin: unknown) => {
		shared.size += update.length;
		schedulePersist(shared);
		const enc = encoding.createEncoder();
		encoding.writeVarUint(enc, MSG_SYNC);
		syncProtocol.writeUpdate(enc, update);
		const msg = encoding.toUint8Array(enc);
		for (const c of shared.conns.values()) if (c !== origin) send(c, msg);
	});
	awareness.on(
		'update',
		({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
			const changed = added.concat(updated, removed);
			const from = origin as Conn | undefined;
			if (from && shared.conns.has(from.ws)) {
				for (const id of added) from.clientIds.add(id);
				for (const id of removed) from.clientIds.delete(id);
			}
			const enc = encoding.createEncoder();
			encoding.writeVarUint(enc, MSG_AWARENESS);
			encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
			const msg = encoding.toUint8Array(enc);
			for (const c of shared.conns.values()) send(c, msg);
		}
	);
	state.docs.set(treeId, shared);
	return shared;
}

function onMessage(s: Shared, conn: Conn, data: Uint8Array) {
	const decoder = decoding.createDecoder(data);
	const enc = encoding.createEncoder();
	const type = decoding.readVarUint(decoder);
	if (type === MSG_SYNC) {
		encoding.writeVarUint(enc, MSG_SYNC);
		const sub = decoding.readVarUint(decoder);
		if (sub === syncProtocol.messageYjsSyncStep1) {
			syncProtocol.readSyncStep1(decoder, enc, s.doc);
		} else if (sub === syncProtocol.messageYjsSyncStep2 || sub === syncProtocol.messageYjsUpdate) {
			if (conn.role !== 'edit') return; // view-only: never apply client changes
			if (s.size > LIMITS.maxDoc) {
				conn.ws.close(CLOSE.tooLarge, 'tree too large');
				return;
			}
			const update = decoding.readVarUint8Array(decoder);
			try {
				Y.applyUpdate(s.doc, update, conn);
			} catch (err) {
				console.warn('[sync] rejected malformed update for', s.id, err);
				conn.ws.close(1003, 'bad update');
				return;
			}
		}
		if (encoding.length(enc) > 1) send(conn, encoding.toUint8Array(enc));
	} else if (type === MSG_AWARENESS) {
		awarenessProtocol.applyAwarenessUpdate(s.awareness, decoding.readVarUint8Array(decoder), conn);
	} else if (type === MSG_QUERY_AWARENESS) {
		encoding.writeVarUint(enc, MSG_AWARENESS);
		encoding.writeVarUint8Array(
			enc,
			awarenessProtocol.encodeAwarenessUpdate(s.awareness, Array.from(s.awareness.getStates().keys()))
		);
		send(conn, encoding.toUint8Array(enc));
	}
}

function onClose(s: Shared, conn: Conn) {
	if (!s.conns.delete(conn.ws)) return;
	awarenessProtocol.removeAwarenessStates(s.awareness, Array.from(conn.clientIds), null);
	if (s.conns.size === 0) {
		persist(s);
		s.evictTimer = setTimeout(() => {
			if (s.conns.size) return;
			persist(s);
			s.awareness.destroy();
			s.doc.destroy();
			state.docs.delete(s.id);
		}, LIMITS.evictAfterMs);
	}
}

function onConnection(ws: WebSocket, token: string) {
	let resolved;
	try {
		resolved = resolveToken(token);
	} catch (err) {
		console.error('[sync] token lookup failed', err);
		ws.close(1011, 'server error');
		return;
	}
	if (!resolved) {
		ws.close(CLOSE.unknown, 'unknown link');
		return;
	}
	const s = getShared(resolved.treeId);
	const conn: Conn = { ws, role: resolved.role, tokenHash: resolved.tokenHash, clientIds: new Set(), alive: true };
	s.conns.set(ws, conn);
	ws.binaryType = 'arraybuffer';
	ws.on('message', (data: ArrayBuffer | Buffer) => {
		try {
			onMessage(s, conn, data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data));
		} catch (err) {
			console.warn('[sync] bad message', err);
			ws.close(1003, 'bad message');
		}
	});
	ws.on('pong', () => (conn.alive = true));
	ws.on('close', () => onClose(s, conn));
	ws.on('error', () => ws.terminate());

	// Start the sync: send our state vector, then current presence.
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, MSG_SYNC);
	syncProtocol.writeSyncStep1(enc, s.doc);
	send(conn, encoding.toUint8Array(enc));
	const states = s.awareness.getStates();
	if (states.size) {
		const a = encoding.createEncoder();
		encoding.writeVarUint(a, MSG_AWARENESS);
		encoding.writeVarUint8Array(a, awarenessProtocol.encodeAwarenessUpdate(s.awareness, Array.from(states.keys())));
		send(conn, encoding.toUint8Array(a));
	}
}

function wss(): WebSocketServer {
	if (!state.wss) {
		state.wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxMessage, perMessageDeflate: false });
		state.pinger = setInterval(() => {
			for (const s of state.docs.values()) {
				for (const c of s.conns.values()) {
					if (!c.alive) {
						c.ws.terminate();
						continue;
					}
					c.alive = false;
					c.ws.ping();
				}
			}
		}, LIMITS.pingMs);
		state.pinger.unref?.();
	}
	return state.wss;
}

/** Attach to an HTTP server's 'upgrade' event. Only call for paths under /ws/. */
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
	const url = new URL(req.url || '/', 'http://localhost');
	if (!url.pathname.startsWith('/ws/')) {
		socket.destroy();
		return;
	}
	// Refuse cross-site pages from opening sockets with a link they somehow hold.
	const origin = req.headers.origin;
	if (origin && process.env.ALLOW_ANY_ORIGIN !== '1') {
		const host = req.headers['x-forwarded-host'] || req.headers.host;
		let ok = false;
		try {
			ok = new URL(origin).host === host;
		} catch {}
		if (!ok) {
			socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
			socket.destroy();
			return;
		}
	}
	const token = decodeURIComponent(url.pathname.slice('/ws/'.length));
	wss().handleUpgrade(req, socket, head, (ws) => onConnection(ws, token));
}

/** Disconnect every socket that used a token which has just been revoked. */
export function kick(treeId: string, tokenHash: string): number {
	const s = state.docs.get(treeId);
	if (!s) return 0;
	let n = 0;
	for (const c of s.conns.values()) {
		if (c.tokenHash === tokenHash) {
			c.ws.close(CLOSE.revoked, 'link revoked');
			n++;
		}
	}
	return n;
}

/** Write every changed document now (shutdown). */
export function flushAll(): void {
	for (const s of state.docs.values()) persist(s);
}

/** Write one tree now, if it is open and has unsaved changes. */
export function flushTree(treeId: string): void {
	const s = state.docs.get(treeId);
	if (s) persist(s);
}

/** Close all sockets and forget in-memory docs (tests and shutdown). */
export function closeAll(): void {
	flushAll();
	for (const s of state.docs.values()) {
		for (const c of s.conns.values()) c.ws.terminate();
		if (s.persistTimer) clearTimeout(s.persistTimer);
		if (s.evictTimer) clearTimeout(s.evictTimer);
		s.awareness.destroy();
		s.doc.destroy();
	}
	state.docs.clear();
	if (state.pinger) clearInterval(state.pinger);
	state.pinger = null;
	state.wss?.close();
	state.wss = null;
}

export function stats() {
	let conns = 0;
	for (const s of state.docs.values()) conns += s.conns.size;
	return { docs: state.docs.size, conns };
}

g.__valuesTree = { kick, flushAll, flushTree, stats };
