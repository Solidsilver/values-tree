import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { SvelteSet } from 'svelte/reactivity';
import { derive, emptyView, keyOf, titleOf } from '$lib/model/derive.ts';
import { LOCAL_ORIGIN, metaOf, nodesOf, rootOrderOf } from '$lib/model/schema.ts';
import type { OpResult } from '$lib/model/ops.ts';
import type { Placement, TreeView } from '$lib/model/types.ts';
import { colorFor, loadIdentity, type Identity } from './presence.ts';

export type Role = 'edit' | 'view';
export type ConnState = 'connecting' | 'synced' | 'offline' | 'reconnecting' | 'revoked' | 'unknown';

export interface Peer {
	clientId: number;
	name: string;
	color: string;
	role: Role;
	selected: string | null;
	self: boolean;
}

const CLOSE_REVOKED = 4001;
const CLOSE_UNKNOWN = 4004;

/**
 * Everything one open tree needs: the Y.Doc (source of truth), the network and offline
 * providers, per-user undo, derived view state, selection, local fold state and presence.
 */
export class Session {
	readonly doc = new Y.Doc();
	readonly treeId: string;
	readonly role: Role;
	token: string;
	provider: WebsocketProvider | null = null;
	idb: IndexeddbPersistence | null = null;
	readonly undoManager: Y.UndoManager;

	view = $state.raw<TreeView>(emptyView());
	/** has the tree arrived (from the server or this device's cache)? */
	loaded = $state(false);
	conn = $state<ConnState>('connecting');
	/** local changes not yet handed to the server */
	pending = $state(false);
	canUndo = $state(false);
	canRedo = $state(false);
	selectedKey = $state<string | null>(null);
	/** the value the user last selected, kept so selection survives remote restructuring */
	private selectedIdMemo: string | null = null;
	readonly collapsed = new SvelteSet<string>();
	peers = $state.raw<Peer[]>([]);
	identity = $state<Identity>(loadIdentity());
	/** announcements of other people's changes, for the live region and toasts */
	announcement = $state('');

	private prefer: OpResult['prefer'] | null = null;
	private scheduled = false;
	private everConnected = false;
	private destroyed = false;

	constructor(opts: { treeId: string; role: Role; token: string }) {
		this.treeId = opts.treeId;
		this.role = opts.role;
		this.token = opts.token;
		this.undoManager = new Y.UndoManager([metaOf(this.doc), nodesOf(this.doc), rootOrderOf(this.doc)], {
			trackedOrigins: new Set([LOCAL_ORIGIN]),
			captureTimeout: 600
		});
		const syncUndo = () => {
			this.canUndo = this.undoManager.canUndo();
			this.canRedo = this.undoManager.canRedo();
		};
		this.undoManager.on('stack-item-added', syncUndo);
		this.undoManager.on('stack-item-popped', syncUndo);
		this.undoManager.on('stack-cleared', syncUndo);

		this.loadCollapsed();
		this.doc.on('afterTransaction', (tr: Y.Transaction) => {
			if (tr.local && tr.origin !== this.provider) {
				if (this.role === 'edit') this.markPending();
			} else if (tr.origin === this.provider) this.noteRemote(tr);
			this.schedule();
		});
	}

	/** Start syncing. Separate from the constructor so SSR never opens sockets. */
	start() {
		if (typeof window === 'undefined') return;
		this.idb = new IndexeddbPersistence('values-tree:' + this.treeId, this.doc);
		this.idb.once('synced', () => {
			if (nodesOf(this.doc).size || metaOf(this.doc).size) this.loaded = true;
			this.schedule();
		});
		this.connect();
		window.addEventListener('online', this.onOnline);
		window.addEventListener('offline', this.onOffline);
	}

	private onOnline = () => {
		if (this.conn === 'offline') this.conn = 'reconnecting';
		this.provider?.connect();
	};
	private onOffline = () => {
		if (this.conn !== 'revoked' && this.conn !== 'unknown') this.conn = 'offline';
	};

	private connect() {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const p = new WebsocketProvider(`${proto}//${location.host}/ws`, this.token, this.doc, {
			maxBackoffTime: 5000,
			disableBc: true
		});
		this.provider = p;
		this.setupAwareness(p);
		p.on('status', ({ status }: { status: string }) => {
			if (this.conn === 'revoked' || this.conn === 'unknown') return;
			if (status === 'connected') {
				this.everConnected = true;
				if (this.conn !== 'synced') this.conn = 'connecting';
			} else if (status === 'disconnected') {
				this.conn = navigator.onLine === false ? 'offline' : this.everConnected ? 'reconnecting' : 'connecting';
			}
		});
		p.on('sync', (s: boolean) => {
			if (s && this.conn !== 'revoked' && this.conn !== 'unknown') {
				this.conn = 'synced';
				this.loaded = true;
				this.flushPending();
				this.schedule();
			}
		});
		p.on('connection-close', (ev: CloseEvent | null) => {
			if (ev?.code === CLOSE_REVOKED || ev?.code === CLOSE_UNKNOWN) {
				this.conn = ev.code === CLOSE_REVOKED ? 'revoked' : 'unknown';
				p.shouldConnect = false;
				p.disconnect();
			}
		});
		// After several failed attempts while the browser says it is offline, say so plainly.
		p.on('connection-error', () => {
			if (navigator.onLine === false) this.conn = 'offline';
		});
	}

	/** Point the session at a new token (after this browser regenerated the edit link). */
	switchToken(token: string) {
		this.token = token;
		const old = this.provider;
		if (old) {
			old.awareness.setLocalState(null);
			old.destroy();
		}
		this.conn = 'connecting';
		this.connect();
	}

	destroy() {
		this.destroyed = true;
		window.removeEventListener('online', this.onOnline);
		window.removeEventListener('offline', this.onOffline);
		this.provider?.awareness.setLocalState(null);
		this.provider?.destroy();
		this.idb?.destroy();
		this.undoManager.destroy();
		this.doc.destroy();
	}

	/* ---------- derived state ---------- */

	private schedule() {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => {
			this.scheduled = false;
			if (this.destroyed) return;
			this.refresh();
		});
	}

	private refresh() {
		const v = derive(this.doc);
		this.view = v;
		if (v.stats.total || this.conn === 'synced') this.loaded = this.loaded || v.stats.total > 0 || this.conn === 'synced';
		this.resolveSelection();
	}

	private resolveSelection() {
		const v = this.view;
		let key = this.selectedKey;
		if (this.prefer) {
			const want = this.prefer;
			this.prefer = null;
			key = null;
			for (const p of v.placements.values()) {
				if (p.id === want.id && (want.parent === undefined || p.parentId === want.parent)) {
					key = p.key;
					break;
				}
			}
			if (!key) key = v.firstKey.get(want.id) ?? null;
		}
		if (key && !v.placements.has(key)) key = null;
		if (!key && this.selectedIdMemo && v.firstKey.has(this.selectedIdMemo)) key = v.firstKey.get(this.selectedIdMemo)!;
		if (key !== this.selectedKey) this.selectedKey = key;
		this.selectedIdMemo = key ? v.placements.get(key)!.id : this.selectedKey ? this.selectedIdMemo : null;
		this.publishSelection();
	}

	get selected(): Placement | null {
		return (this.selectedKey && this.view.placements.get(this.selectedKey)) || null;
	}

	select(key: string | null) {
		this.selectedKey = key;
		this.selectedIdMemo = key ? (this.view.placements.get(key)?.id ?? null) : null;
		if (key) this.revealKey(key);
		this.publishSelection();
	}

	/** Unfold every ancestor on the path of a placement key so it is visible. */
	revealKey(key: string) {
		const parts = key.split('/');
		let changed = false;
		for (const id of parts.slice(0, -1)) {
			if (this.collapsed.has(id)) {
				this.collapsed.delete(id);
				changed = true;
			}
		}
		if (changed) this.saveCollapsed();
	}

	/** Apply what an operation asked for: selection, unfolding, messages. Returns the error, if any. */
	after(r: OpResult): OpResult {
		if (r.expand?.length) {
			for (const id of r.expand) this.collapsed.delete(id);
			this.saveCollapsed();
		}
		if (r.prefer) {
			this.prefer = r.prefer;
			this.selectedKey = null;
		} else if (r.selectKey !== undefined) {
			this.selectedKey = r.selectKey;
			this.selectedIdMemo = r.selectKey ? r.selectKey.split('/').at(-1)! : null;
		}
		// derive now so callers can focus the result synchronously
		this.refresh();
		if (this.selectedKey) this.revealKey(this.selectedKey);
		return r;
	}

	/* ---------- folding (per viewer, local only) ---------- */

	private foldKey() {
		return 'vt:folds:' + this.treeId;
	}
	private loadCollapsed() {
		try {
			const raw = JSON.parse(localStorage.getItem(this.foldKey()) || '[]');
			if (Array.isArray(raw)) for (const id of raw) if (typeof id === 'string') this.collapsed.add(id);
		} catch {}
	}
	saveCollapsed() {
		try {
			localStorage.setItem(this.foldKey(), JSON.stringify([...this.collapsed]));
		} catch {}
	}
	toggleFold(id: string, open?: boolean) {
		const isOpen = !this.collapsed.has(id);
		const next = open ?? !isOpen;
		if (next) this.collapsed.delete(id);
		else this.collapsed.add(id);
		this.saveCollapsed();
	}

	/* ---------- undo ---------- */

	undo() {
		if (this.role !== 'edit') return;
		this.undoManager.undo();
	}
	redo() {
		if (this.role !== 'edit') return;
		this.undoManager.redo();
	}

	/* ---------- save state ---------- */

	private pendingTimer: ReturnType<typeof setTimeout> | null = null;
	private markPending() {
		this.pending = true;
		this.flushPending();
	}
	/** Local updates go straight onto the socket; call it saved once the socket buffer drains. */
	private flushPending() {
		if (this.pendingTimer) clearTimeout(this.pendingTimer);
		this.pendingTimer = setTimeout(() => {
			const ws = this.provider?.ws;
			if (this.conn === 'synced' && ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount === 0) {
				this.pending = false;
			} else if (this.conn === 'synced') this.flushPending();
		}, 350);
	}

	/* ---------- presence ---------- */

	private setupAwareness(p: WebsocketProvider) {
		const a = p.awareness;
		a.setLocalStateField('user', { name: this.identity.name, color: this.identity.color, role: this.role });
		a.setLocalStateField('selected', this.selected?.id ?? null);
		a.on('change', () => {
			const out: Peer[] = [];
			a.getStates().forEach((st, clientId) => {
				const u = st.user;
				if (!u || typeof u.name !== 'string') return;
				out.push({
					clientId,
					name: u.name.slice(0, 40) || 'Someone',
					color: typeof u.color === 'string' && /^#[0-9a-f]{6}$/i.test(u.color) ? u.color : colorFor(String(clientId)),
					role: u.role === 'edit' ? 'edit' : 'view',
					selected: typeof st.selected === 'string' ? st.selected : null,
					self: clientId === this.doc.clientID
				});
			});
			out.sort((x, y) => Number(y.self) - Number(x.self) || x.name.localeCompare(y.name));
			this.peers = out;
		});
	}

	setIdentity(id: Identity) {
		this.identity = id;
		this.provider?.awareness.setLocalStateField('user', { name: id.name, color: id.color, role: this.role });
	}

	private publishSelection() {
		const a = this.provider?.awareness;
		if (!a) return;
		const id = this.selected?.id ?? null;
		if (a.getLocalState()?.selected !== id) a.setLocalStateField('selected', id);
	}

	private nameFor(clientIds: Iterable<number>): string {
		const states = this.provider?.awareness.getStates();
		for (const c of clientIds) {
			const u = states?.get(c)?.user;
			if (u?.name) return String(u.name).slice(0, 40);
		}
		const others = this.peers.filter((p) => !p.self && p.role === 'edit');
		return others.length === 1 ? others[0].name : 'Someone';
	}

	/** Describe other people's additions and deletions for the live region. */
	private noteRemote(tr: Y.Transaction) {
		const before = this.view;
		const after = derive(this.doc);
		const added = Object.keys(after.nodes).filter((id) => !before.nodes[id]);
		const removed = Object.keys(before.nodes).filter((id) => !after.nodes[id]);
		if (!added.length && !removed.length) return;
		if (!this.loaded || before.stats.total === 0) return; // initial load, not news
		const authors = new Set<number>();
		tr.afterState.forEach((clock, client) => {
			if ((tr.beforeState.get(client) ?? 0) < clock) authors.add(client);
		});
		const who = this.nameFor(authors);
		const list = (ids: string[], v: TreeView) =>
			ids.length === 1 ? (v.nodes[ids[0]]?.title ? '“' + titleOf(v, ids[0]) + '”' : 'a new value') : ids.length + ' values';
		const parts: string[] = [];
		if (added.length) parts.push('added ' + list(added, after));
		if (removed.length) parts.push('removed ' + list(removed, before));
		this.announcement = who + ' ' + parts.join(' and ');
	}

	/* ---------- helpers ---------- */

	keyFor(id: string, parentKey: string | null) {
		return keyOf(parentKey, id);
	}
}
