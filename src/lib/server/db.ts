/**
 * SQLite access, kept behind this module so `node:sqlite` can be swapped for better-sqlite3.
 * One connection per process: in production the SvelteKit bundle and server.ts load separate
 * copies of this module, so the handle lives on globalThis.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface TreeRow {
	id: string;
	edit_hash: string;
	view_hash: string;
	title: string;
	view_sealed: string;
	state: Uint8Array | null;
	created_at: number;
	updated_at: number;
}

export interface SnapshotMeta {
	id: number;
	created_at: number;
	kind: string;
	title: string;
	values_count: number;
}
export interface SnapshotRow extends SnapshotMeta {
	tree_id: string;
	hash: string;
	data: string;
}

export interface Db {
	insertTree(row: Omit<TreeRow, 'updated_at'> & { updated_at?: number }): void;
	byHash(hash: string): (Pick<TreeRow, 'id' | 'edit_hash' | 'view_hash' | 'title' | 'view_sealed'>) | undefined;
	loadState(id: string): Uint8Array | null;
	saveState(id: string, state: Uint8Array, title: string): void;
	setHashes(id: string, editHash: string, viewHash: string, viewSealed: string): void;
	exists(id: string): boolean;
	addSnapshot(r: Omit<SnapshotRow, 'id'>): number;
	lastSnapshot(treeId: string): Pick<SnapshotRow, 'id' | 'created_at' | 'hash'> | undefined;
	listSnapshots(treeId: string): SnapshotMeta[];
	getSnapshot(treeId: string, id: number): (SnapshotMeta & { data: string }) | undefined;
	deleteSnapshots(ids: number[]): void;
	close(): void;
}

const KEY = Symbol.for('values-tree.db');
type G = typeof globalThis & { [KEY]?: Db };

export function dataDir(): string {
	return resolve(process.env.DATA_DIR || './data');
}

export function openDb(file = process.env.DB_FILE || join(dataDir(), 'values-tree.db')): Db {
	if (file !== ':memory:') mkdirSync(resolve(file, '..'), { recursive: true });
	const db = new DatabaseSync(file);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
	db.exec(`CREATE TABLE IF NOT EXISTS trees (
		id          TEXT PRIMARY KEY,
		edit_hash   TEXT NOT NULL UNIQUE,
		view_hash   TEXT NOT NULL UNIQUE,
		title       TEXT NOT NULL DEFAULT '',
		view_sealed TEXT NOT NULL DEFAULT '',
		state       BLOB,
		created_at  INTEGER NOT NULL,
		updated_at  INTEGER NOT NULL
	)`);
	const cols = (db.prepare('PRAGMA table_info(trees)').all() as { name: string }[]).map((c) => c.name);
	if (!cols.includes('view_sealed')) db.exec("ALTER TABLE trees ADD COLUMN view_sealed TEXT NOT NULL DEFAULT ''");
	// Version history: full plain-JSON copies of a tree, taken every few minutes while it is edited.
	db.exec(`CREATE TABLE IF NOT EXISTS snapshots (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		tree_id      TEXT NOT NULL,
		created_at   INTEGER NOT NULL,
		kind         TEXT NOT NULL,
		title        TEXT NOT NULL DEFAULT '',
		values_count INTEGER NOT NULL DEFAULT 0,
		hash         TEXT NOT NULL,
		data         TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS snapshots_tree ON snapshots (tree_id, created_at)`);
	const snapIns = db.prepare(
		'INSERT INTO snapshots (tree_id, created_at, kind, title, values_count, hash, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
	);
	const snapLast = db.prepare(
		'SELECT id, created_at, hash FROM snapshots WHERE tree_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
	);
	const snapList = db.prepare(
		'SELECT id, created_at, kind, title, values_count FROM snapshots WHERE tree_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000'
	);
	const snapGet = db.prepare(
		'SELECT id, created_at, kind, title, values_count, data FROM snapshots WHERE tree_id = ? AND id = ?'
	);
	const snapDel = db.prepare('DELETE FROM snapshots WHERE id = ?');
	const ins = db.prepare(
		'INSERT INTO trees (id, edit_hash, view_hash, title, view_sealed, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	);
	const byHash = db.prepare(
		'SELECT id, edit_hash, view_hash, title, view_sealed FROM trees WHERE edit_hash = ? OR view_hash = ?'
	);
	const load = db.prepare('SELECT state FROM trees WHERE id = ?');
	const save = db.prepare('UPDATE trees SET state = ?, title = ?, updated_at = ? WHERE id = ?');
	const setHashes = db.prepare('UPDATE trees SET edit_hash = ?, view_hash = ?, view_sealed = ?, updated_at = ? WHERE id = ?');
	const exists = db.prepare('SELECT 1 AS x FROM trees WHERE id = ?');
	return {
		insertTree(r) {
			ins.run(r.id, r.edit_hash, r.view_hash, r.title, r.view_sealed, r.state, r.created_at, r.updated_at ?? r.created_at);
		},
		byHash(hash) {
			return byHash.get(hash, hash) as ReturnType<Db['byHash']>;
		},
		loadState(id) {
			const row = load.get(id) as { state: Uint8Array | null } | undefined;
			return row?.state ? new Uint8Array(row.state) : null;
		},
		saveState(id, state, title) {
			save.run(state, title.slice(0, 200), Date.now(), id);
		},
		setHashes(id, editHash, viewHash, viewSealed) {
			setHashes.run(editHash, viewHash, viewSealed, Date.now(), id);
		},
		exists(id) {
			return !!exists.get(id);
		},
		addSnapshot(r) {
			const res = snapIns.run(r.tree_id, r.created_at, r.kind, r.title.slice(0, 200), r.values_count, r.hash, r.data);
			return Number(res.lastInsertRowid);
		},
		lastSnapshot(treeId) {
			return snapLast.get(treeId) as ReturnType<Db['lastSnapshot']>;
		},
		listSnapshots(treeId) {
			return snapList.all(treeId) as unknown as SnapshotMeta[];
		},
		getSnapshot(treeId, id) {
			return snapGet.get(treeId, id) as ReturnType<Db['getSnapshot']>;
		},
		deleteSnapshots(ids) {
			if (!ids.length) return;
			db.exec('BEGIN');
			try {
				for (const id of ids) snapDel.run(id);
				db.exec('COMMIT');
			} catch (err) {
				db.exec('ROLLBACK');
				throw err;
			}
		},
		close() {
			db.close();
		}
	};
}

export function getDb(): Db {
	const g = globalThis as G;
	return (g[KEY] ??= openDb());
}

/** Tests only: use a specific database (for example ':memory:'). */
export function setDb(db: Db): void {
	(globalThis as G)[KEY] = db;
}
