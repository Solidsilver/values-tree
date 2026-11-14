import * as Y from 'yjs';
import { getDb } from './db.ts';
import { hashToken, isTokenShape, newToken, newTreeId, sameHash, sealView, unsealView } from './tokens.ts';
import { docFromTree } from '../model/schema.ts';
import type { PlainTree } from '../model/types.ts';
import { recordSnapshot, treeFromDoc } from './history.ts';

export type Role = 'edit' | 'view';

export interface Resolved {
	treeId: string;
	role: Role;
	title: string;
	tokenHash: string;
}

/** Map a secret link token to its tree and role, or null if it is unknown or revoked. */
export function resolveToken(token: string): Resolved | null {
	if (!isTokenShape(token)) return null;
	const h = hashToken(token);
	const row = getDb().byHash(h);
	if (!row) return null;
	if (sameHash(row.edit_hash, h)) return { treeId: row.id, role: 'edit', title: row.title, tokenHash: h };
	if (sameHash(row.view_hash, h)) return { treeId: row.id, role: 'view', title: row.title, tokenHash: h };
	return null;
}

/** The current view token, for an edit-token holder (null for anyone else). */
export function viewTokenFor(editToken: string): string | null {
	const r = resolveToken(editToken);
	if (!r || r.role !== 'edit') return null;
	const row = getDb().byHash(r.tokenHash);
	return row ? unsealView(editToken, row.view_sealed) : null;
}

export interface Created {
	treeId: string;
	editToken: string;
	viewToken: string;
}

export function createTree(tree: PlainTree): Created {
	const doc = docFromTree(tree);
	const state = Y.encodeStateAsUpdate(doc);
	const plain = treeFromDoc(doc);
	doc.destroy();
	const editToken = newToken();
	const viewToken = newToken();
	const now = Date.now();
	const treeId = newTreeId();
	getDb().insertTree({
		id: treeId,
		edit_hash: hashToken(editToken),
		view_hash: hashToken(viewToken),
		view_sealed: sealView(editToken, viewToken),
		title: tree.title.slice(0, 200),
		state,
		created_at: now
	});
	recordSnapshot(treeId, plain, 'created', now);
	return { treeId, editToken, viewToken };
}

type Hooks = { kick(treeId: string, tokenHash: string): void; flushAll(): void };
const HOOK = '__valuesTree';

/**
 * Replace the edit or view token. The old one stops working at once: its sockets are closed
 * through the sync server's hook on globalThis (shared across module copies).
 */
export function rotate(editToken: string, which: Role): { token: string; editToken: string; viewToken: string } | null {
	const r = resolveToken(editToken);
	if (!r || r.role !== 'edit') return null;
	const db = getDb();
	const row = db.byHash(r.tokenHash)!;
	let viewToken = unsealView(editToken, row.view_sealed);
	let nextEdit = editToken;
	let oldHash: string;
	if (which === 'view' || !viewToken) {
		// (a missing seal can only be repaired by issuing a new view link)
		oldHash = row.view_hash;
		viewToken = newToken();
	}
	if (which === 'edit') {
		oldHash = row.edit_hash;
		nextEdit = newToken();
	}
	db.setHashes(r.treeId, hashToken(nextEdit), hashToken(viewToken), sealView(nextEdit, viewToken));
	const hooks = (globalThis as unknown as Record<string, Hooks | undefined>)[HOOK];
	hooks?.kick(r.treeId, oldHash!);
	if (which === 'edit' && row.view_hash !== hashToken(viewToken)) hooks?.kick(r.treeId, row.view_hash);
	return { token: which === 'edit' ? nextEdit : viewToken, editToken: nextEdit, viewToken };
}
