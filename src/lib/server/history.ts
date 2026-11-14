/**
 * Version history. A snapshot is the whole tree as plain JSON (the same shape an export
 * imports from), so it can be previewed and restored without replaying Yjs history.
 *
 * Snapshots are taken:
 *   - when a tree is created ("created"),
 *   - when a tree is opened or saved and the last snapshot is older than SNAPSHOT_EVERY_MS ("auto"),
 *   - just before someone restores an older version ("restore").
 * Identical content is never stored twice in a row.
 */
import { createHash } from 'node:crypto';
import * as Y from 'yjs';
import { getDb, type SnapshotMeta } from './db.ts';
import { derive } from '../model/derive.ts';
import { viewToTree } from '../model/io.ts';
import type { PlainTree } from '../model/types.ts';

export type SnapshotKind = 'auto' | 'created' | 'restore';

export const HISTORY = {
	everyMs: Number(process.env.SNAPSHOT_EVERY_MS || 10 * 60_000),
	/** keep every snapshot this recent */
	keepAllMs: 2 * 24 * 3600_000,
	/** then one per day until this age, then one per 30 days */
	dailyMs: 90 * 24 * 3600_000,
	maxPerTree: 600
};

const DAY = 24 * 3600_000;

export function treeFromDoc(doc: Y.Doc): PlainTree {
	return viewToTree(derive(doc));
}

/** Store a snapshot unless it matches the latest one. Returns the id of the snapshot holding this content. */
export function recordSnapshot(treeId: string, tree: PlainTree, kind: SnapshotKind, now = Date.now()): number {
	const data = JSON.stringify(tree);
	const hash = createHash('sha256').update(data).digest('hex');
	const db = getDb();
	const last = db.lastSnapshot(treeId);
	if (last && last.hash === hash) return last.id;
	const id = db.addSnapshot({
		tree_id: treeId,
		created_at: now,
		kind,
		title: tree.title,
		values_count: Object.keys(tree.nodes).length,
		hash,
		data
	});
	db.deleteSnapshots(expiredSnapshots(db.listSnapshots(treeId), now));
	return id;
}

/** Take an "auto" snapshot if enough time has passed since the last one. Never throws. */
export function maybeSnapshot(treeId: string, doc: Y.Doc, now = Date.now()): void {
	try {
		const last = getDb().lastSnapshot(treeId);
		if (last && now - last.created_at < HISTORY.everyMs) return;
		recordSnapshot(treeId, treeFromDoc(doc), 'auto', now);
	} catch (err) {
		console.error('[history] snapshot failed for', treeId, err);
	}
}

/**
 * Which snapshots to drop: keep everything from the last two days, then the newest per day
 * up to 90 days, then the newest per 30 days. The newest snapshot is always kept.
 */
export function expiredSnapshots(rows: Pick<SnapshotMeta, 'id' | 'created_at'>[], now: number): number[] {
	const sorted = [...rows].sort((a, b) => b.created_at - a.created_at || b.id - a.id);
	const seen = new Set<string>();
	const out: number[] = [];
	sorted.forEach((r, i) => {
		if (i >= HISTORY.maxPerTree) {
			out.push(r.id);
			return;
		}
		const age = now - r.created_at;
		if (age < HISTORY.keepAllMs) return;
		const bucket = age < HISTORY.dailyMs ? 'd' + Math.floor(r.created_at / DAY) : 'm' + Math.floor(r.created_at / (30 * DAY));
		if (seen.has(bucket) && i > 0) out.push(r.id);
		else seen.add(bucket);
	});
	return out;
}

export interface Version {
	id: number;
	at: number;
	kind: SnapshotKind;
	title: string;
	values: number;
}

export function listVersions(treeId: string): Version[] {
	return getDb()
		.listSnapshots(treeId)
		.map((r) => ({ id: r.id, at: r.created_at, kind: r.kind as SnapshotKind, title: r.title, values: r.values_count }));
}

export function getVersion(treeId: string, id: number): (Version & { tree: PlainTree }) | null {
	const r = getDb().getSnapshot(treeId, id);
	if (!r) return null;
	return {
		id: r.id,
		at: r.created_at,
		kind: r.kind as SnapshotKind,
		title: r.title,
		values: r.values_count,
		tree: JSON.parse(r.data) as PlainTree
	};
}

/**
 * Save the tree as it is right now (including edits still in the sync server's memory)
 * before it is replaced. Returns the snapshot id, or null if the tree has no stored state.
 */
export function checkpoint(treeId: string): number | null {
	const hooks = (globalThis as unknown as Record<string, { flushTree?(id: string): void } | undefined>).__valuesTree;
	hooks?.flushTree?.(treeId);
	const state = getDb().loadState(treeId);
	if (!state) return null;
	const doc = new Y.Doc();
	try {
		Y.applyUpdate(doc, state);
		return recordSnapshot(treeId, treeFromDoc(doc), 'restore');
	} finally {
		doc.destroy();
	}
}
