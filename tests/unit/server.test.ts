import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { openDb, setDb, type Db } from '../../src/lib/server/db.ts';
import { createTree, resolveToken, rotate, viewTokenFor } from '../../src/lib/server/trees.ts';
import { hashToken, isTokenShape, newToken, sameHash } from '../../src/lib/server/tokens.ts';
import { closeAll, handleUpgrade, flushAll } from '../../src/lib/server/sync.ts';
import { normalize } from '../../src/lib/model/io.ts';
import { derive } from '../../src/lib/model/derive.ts';
import * as ops from '../../src/lib/model/ops.ts';
import { nodesOf } from '../../src/lib/model/schema.ts';
import { tokenBucket } from '../../src/lib/server/ratelimit.ts';
import { checkpoint, getVersion, HISTORY, listVersions } from '../../src/lib/server/history.ts';

const seed = JSON.parse(readFileSync(new URL('../fixtures/sample-v2.json', import.meta.url), 'utf8'));
let server: Server;
let url: string;
let db: Db;
const providers: WebsocketProvider[] = [];

beforeAll(async () => {
	db = openDb(':memory:');
	setDb(db);
	server = createServer((_req, res) => res.end('ok'));
	server.on('upgrade', (req, socket, head) => handleUpgrade(req, socket, head));
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});
afterAll(async () => {
	for (const p of providers) p.destroy();
	closeAll();
	await new Promise((r) => server.close(r));
});

function connect(token: string) {
	const doc = new Y.Doc();
	const p = new WebsocketProvider(url, token, doc, { WebSocketPolyfill: WebSocket as any, disableBc: true, maxBackoffTime: 200 });
	providers.push(p);
	return { doc, p };
}
const synced = (p: WebsocketProvider) =>
	new Promise<void>((r) => (p.synced ? r() : p.once('sync', (s: boolean) => s && r())));
async function until(fn: () => boolean, ms = 3000) {
	const t = Date.now();
	while (!fn()) {
		if (Date.now() - t > ms) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 15));
	}
}
const shape = (doc: Y.Doc) => {
	const v = derive(doc);
	return { roots: v.roots, nodes: Object.fromEntries(Object.entries(v.nodes).map(([k, n]) => [k, [n.title, n.meaning, n.children.join(',')]])), parents: [...v.parentsOf] };
};

describe('tokens', () => {
	it('makes 22-char base64url tokens and stores only hashes', () => {
		const t = newToken();
		expect(isTokenShape(t)).toBe(true);
		expect(hashToken(t)).toHaveLength(64);
		expect(sameHash(hashToken(t), hashToken(t))).toBe(true);
		expect(sameHash(hashToken(t), hashToken(newToken()))).toBe(false);
		expect(isTokenShape('../etc/passwd')).toBe(false);
	});
	it('rate limits', () => {
		const b = tokenBucket({ capacity: 2, refillPerMinute: 1 });
		expect([b.take('a', 0), b.take('a', 0), b.take('a', 0), b.take('a', 60_000)]).toEqual([true, true, false, true]);
	});
});

describe('trees and sync', () => {
	it('creates a tree from the sample and resolves both links', () => {
		const c = createTree(normalize(seed));
		expect(resolveToken(c.editToken)?.role).toBe('edit');
		expect(resolveToken(c.viewToken)?.role).toBe('view');
		expect(resolveToken(newToken())).toBeNull();
		expect(viewTokenFor(c.editToken)).toBe(c.viewToken);
		expect(viewTokenFor(c.viewToken)).toBeNull();
		const r = rotate(c.editToken, 'edit')!;
		expect(resolveToken(c.editToken)).toBeNull();
		expect(viewTokenFor(r.editToken)).toBe(c.viewToken); // view link survives an edit-link rotation
		expect(resolveToken(c.viewToken)?.role).toBe('view');
	});

	it('two edit clients converge, including the crossing-move loop case', async () => {
		const c = createTree(normalize({ title: 'T', roots: ['r'], nodes: { r: { title: 'R', children: ['a', 'b'] }, a: { title: 'A' }, b: { title: 'B' } } }));
		const A = connect(c.editToken);
		const B = connect(c.editToken);
		await Promise.all([synced(A.p), synced(B.p)]);
		expect(derive(A.doc).stats.total).toBe(3);
		// go "offline" together, make crossing moves, reconnect
		A.p.disconnect();
		B.p.disconnect();
		ops.moveTo(A.doc, derive(A.doc), 'r/a', 'b');
		ops.moveTo(B.doc, derive(B.doc), 'r/b', 'a');
		const ta = nodesOf(A.doc).get('r')!.get('meaning') as Y.Text;
		const tb = nodesOf(B.doc).get('r')!.get('meaning') as Y.Text;
		ta.insert(0, 'alpha ');
		tb.insert(0, 'beta ');
		A.p.connect();
		B.p.connect();
		await until(() => JSON.stringify(shape(A.doc)) === JSON.stringify(shape(B.doc)) && ta.toString().length === 11);
		const v = derive(A.doc);
		expect(v.stats.total).toBe(3);
		expect(v.firstKey.size).toBe(3);
	});

	it('drops document changes from view-only clients', async () => {
		const c = createTree(normalize(seed));
		const V = connect(c.viewToken);
		const E = connect(c.editToken);
		await Promise.all([synced(V.p), synced(E.p)]);
		expect(derive(V.doc).stats.total).toBe(28);
		// a view client that edits anyway (bypassing the UI)
		ops.addRoot(V.doc, derive(V.doc), 'Sneaky');
		// an edit client's change still reaches the view client
		ops.addRoot(E.doc, derive(E.doc), 'Legit');
		await until(() => Object.values(derive(V.doc).nodes).some((n) => n.title === 'Legit'));
		await new Promise((r) => setTimeout(r, 200));
		const titles = Object.values(derive(E.doc).nodes).map((n) => n.title);
		expect(titles).toContain('Legit');
		expect(titles).not.toContain('Sneaky');
		// a fresh client sees no trace of it either, and neither does the database
		const F = connect(c.editToken);
		await synced(F.p);
		expect(Object.values(derive(F.doc).nodes).map((n) => n.title)).not.toContain('Sneaky');
		flushAll();
		const stored = new Y.Doc();
		Y.applyUpdate(stored, db.loadState(resolveToken(c.editToken)!.treeId)!);
		expect(Object.values(derive(stored).nodes).map((n) => n.title)).not.toContain('Sneaky');
	});

	it('rotating a link disconnects its sockets and the old token stops working', async () => {
		const c = createTree(normalize(seed));
		const V = connect(c.viewToken);
		const E = connect(c.editToken);
		await Promise.all([synced(V.p), synced(E.p)]);
		const closes: number[] = [];
		V.p.on('connection-close', (ev: any) => ev && closes.push(ev.code));
		const r = rotate(c.editToken, 'view')!;
		expect(r.token).not.toBe(c.viewToken);
		await until(() => closes.includes(4001));
		expect(resolveToken(c.viewToken)).toBeNull();
		expect(resolveToken(r.token)?.role).toBe('view');
		// reconnect attempts with the old token are refused
		await until(() => closes.includes(4004));
		V.p.disconnect();
		expect(E.p.wsconnected).toBe(true);
		expect(rotate(r.token, 'edit')).toBeNull(); // view links cannot rotate
	});

	it('persists to the database', async () => {
		const c = createTree(normalize({ roots: [], nodes: {} }));
		const E = connect(c.editToken);
		await synced(E.p);
		ops.addRoot(E.doc, derive(E.doc), 'Persisted');
		await new Promise((r) => setTimeout(r, 100));
		flushAll();
		const stored = new Y.Doc();
		Y.applyUpdate(stored, db.loadState(resolveToken(c.editToken)!.treeId)!);
		expect(Object.values(derive(stored).nodes).map((n) => n.title)).toEqual(['Persisted']);
	});

	it('keeps version history: on create, on save after the interval, and before a restore', async () => {
		const c = createTree(normalize({ title: 'H', roots: ['r'], nodes: { r: { title: 'Root', children: ['a'] }, a: { title: 'A' } } }));
		const treeId = resolveToken(c.editToken)!.treeId;
		expect(listVersions(treeId).map((v) => v.kind)).toEqual(['created']);
		const E = connect(c.editToken);
		await synced(E.p);
		const every = HISTORY.everyMs;
		try {
			HISTORY.everyMs = 0;
			ops.addRoot(E.doc, derive(E.doc), 'Second');
			await new Promise((r) => setTimeout(r, 100));
			flushAll();
			const vs = listVersions(treeId);
			expect(vs.map((v) => v.kind)).toEqual(['auto', 'created']);
			expect(vs[0].values).toBe(3);
			// a change still in the server's memory is captured by the pre-restore checkpoint
			ops.addRoot(E.doc, derive(E.doc), 'Unsaved');
			await until(() => checkpoint(treeId) !== vs[0].id);
			const latest = listVersions(treeId)[0];
			expect(latest.values).toBe(4);
			expect(Object.values(getVersion(treeId, latest.id)!.tree.nodes).map((n) => n.title)).toContain('Unsaved');
			// identical content is not stored twice
			expect(checkpoint(treeId)).toBe(latest.id);
			// restoring the first version is an ordinary edit that syncs to everyone
			const B = connect(c.editToken);
			await synced(B.p);
			ops.replaceTree(E.doc, getVersion(treeId, vs[1].id)!.tree);
			await until(() => derive(B.doc).stats.total === 2);
			expect(Object.values(derive(B.doc).nodes).map((n) => n.title).sort()).toEqual(['A', 'Root']);
		} finally {
			HISTORY.everyMs = every;
		}
	});
});
