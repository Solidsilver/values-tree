import type * as Y from 'yjs';
import { uid } from './ids.ts';
import {
	LOCAL_ORIGIN,
	childrenOf,
	makeNode,
	nodesOf,
	notesOf,
	rankOf,
	rootOrderOf,
	writeTree,
	type YNode
} from './schema.ts';
import { deletionSet, keyOf, noLoop, titleOf } from './derive.ts';
import type { PlainTree, TreeView } from './types.ts';

/**
 * Tree operations on the shared doc, ported from the original app. Each takes the current
 * derived view (for placements and parent order), mutates the doc in one LOCAL_ORIGIN
 * transaction, and says what to select next. Blocked operations return `{ error }` and
 * leave the doc untouched.
 */
export interface OpResult {
	/** select this exact placement key after the change */
	selectKey?: string | null;
	/** or: select the first placement of `id` (under `parent` when given) */
	prefer?: { id: string; parent?: string | null };
	/** values the local viewer should unfold so the result is visible */
	expand?: string[];
	/** a short message for a toast */
	message?: string;
	error?: string;
	/** id of a newly created value */
	created?: string;
}

/**
 * Every structural change first writes down each value's current parent order, as the original
 * did on every render. Without this, a default ("higher in the tree first") order could silently
 * flip when an unrelated move changes how deep a parent sits.
 */
function freezeRanks(doc: Y.Doc, v: TreeView) {
	v.parentsOf.forEach((ps, id) => {
		const n = yNode(doc, id);
		const r = n && rankOf(n);
		if (!r) return;
		const cur = r.toArray();
		if (cur.length === ps.length && cur.every((x, i) => x === ps[i])) return;
		r.delete(0, r.length);
		r.push(ps.slice());
	});
}

const tx = (doc: Y.Doc, v: TreeView, fn: () => void) =>
	doc.transact(() => {
		freezeRanks(doc, v);
		fn();
	}, LOCAL_ORIGIN);

const yNode = (doc: Y.Doc, id: string): YNode | undefined => nodesOf(doc).get(id);
const kidsArr = (doc: Y.Doc, id: string) => {
	const n = yNode(doc, id);
	return n ? childrenOf(n) : undefined;
};

function removeAll(arr: Y.Array<string> | undefined, id: string) {
	if (!arr) return;
	const a = arr.toArray();
	for (let i = a.length - 1; i >= 0; i--) if (a[i] === id) arr.delete(i, 1);
}

/** Make the stored rootOrder match the derived roots, so targeted inserts land where the user sees them. */
function ensureRootOrder(doc: Y.Doc, v: TreeView) {
	const ro = rootOrderOf(doc);
	const cur = ro.toArray();
	if (cur.length === v.roots.length && cur.every((x, i) => x === v.roots[i])) return;
	if (cur.length) ro.delete(0, cur.length);
	if (v.roots.length) ro.push(v.roots.slice());
}

/** The Y.Array that holds a placement's sibling list (a parent's children, or rootOrder). */
function listArr(doc: Y.Doc, v: TreeView, parentId: string | null): Y.Array<string> | undefined {
	if (parentId) return kidsArr(doc, parentId);
	ensureRootOrder(doc, v);
	return rootOrderOf(doc);
}

function insertAfter(arr: Y.Array<string>, anchor: string, ids: string[]) {
	const i = arr.toArray().indexOf(anchor);
	arr.insert(i < 0 ? arr.length : i + 1, ids);
}

/** Keep a moved link's place in the precedence order, and carry its note. */
function swapRank(doc: Y.Doc, id: string, from: string, to: string) {
	const n = yNode(doc, id);
	if (!n) return;
	const r = rankOf(n);
	if (r) {
		const a = r.toArray();
		const i = a.indexOf(from);
		if (i >= 0 && !a.includes(to)) {
			r.delete(i, 1);
			r.insert(i, [to]);
		}
	}
	const notes = notesOf(n);
	if (notes) {
		const fromNote = notes.get(from);
		if (fromNote && to && !notes.get(to)) notes.set(to, fromNote);
		if (notes.has(from)) notes.delete(from);
	}
}

function removeAllParents(doc: Y.Doc, id: string) {
	nodesOf(doc).forEach((n) => removeAll(childrenOf(n), id));
}

export function addRoot(doc: Y.Doc, v: TreeView, title = ''): OpResult {
	const id = uid();
	tx(doc, v, () => {
		nodesOf(doc).set(id, makeNode({ title }));
		ensureRootOrder(doc, v);
		rootOrderOf(doc).push([id]);
	});
	return { selectKey: id, created: id };
}

export function addChild(doc: Y.Doc, v: TreeView, key: string, title = ''): OpResult {
	const pl = v.placements.get(key);
	if (!pl) return {};
	const id = uid();
	tx(doc, v, () => {
		nodesOf(doc).set(id, makeNode({ title }));
		kidsArr(doc, pl.id)?.push([id]);
	});
	return { selectKey: key + '/' + id, expand: [pl.id], created: id };
}

export function addSibling(doc: Y.Doc, v: TreeView, key: string, title = ''): OpResult {
	const pl = v.placements.get(key);
	if (!pl) return {};
	const id = uid();
	tx(doc, v, () => {
		nodesOf(doc).set(id, makeNode({ title }));
		const arr = listArr(doc, v, pl.parentId);
		if (arr) insertAfter(arr, pl.id, [id]);
	});
	return { selectKey: keyOf(pl.parentKey, id), created: id };
}

/** Reorder among siblings (dir -1 = up, +1 = down). */
export function moveSibling(doc: Y.Doc, v: TreeView, key: string, dir: -1 | 1): OpResult {
	const pl = v.placements.get(key);
	if (!pl) return {};
	const j = pl.i + dir;
	if (j < 0 || j >= pl.list.length) return {};
	const other = pl.list[j];
	tx(doc, v, () => {
		const arr = listArr(doc, v, pl.parentId);
		if (!arr) return;
		removeAll(arr, pl.id);
		const k = arr.toArray().indexOf(other);
		arr.insert(k < 0 ? arr.length : dir < 0 ? k : k + 1, [pl.id]);
	});
	return { selectKey: key };
}

export function canMoveOut(v: TreeView, key: string): boolean {
	const pl = v.placements.get(key);
	if (!pl || !pl.parentKey) return false;
	const g = v.placements.get(pl.parentKey)!;
	return !(g.parentId === null && (v.parentsOf.get(pl.id) || []).length > 1);
}

/** Make it a sibling of the value it grows from here. */
export function moveOut(doc: Y.Doc, v: TreeView, key: string): OpResult {
	if (!canMoveOut(v, key)) return {};
	const pl = v.placements.get(key)!;
	const g = v.placements.get(pl.parentKey!)!;
	tx(doc, v, () => {
		removeAll(kidsArr(doc, pl.parentId!), pl.id);
		if (!g.list.includes(pl.id)) {
			const arr = listArr(doc, v, g.parentId);
			if (arr) insertAfter(arr, g.id, [pl.id]);
		}
		if (g.parentId) swapRank(doc, pl.id, pl.parentId!, g.parentId);
	});
	return { prefer: { id: pl.id, parent: g.parentId } };
}

export function canMoveIn(v: TreeView, key: string): boolean {
	const pl = v.placements.get(key);
	if (!pl || pl.i === 0) return false;
	return noLoop(v, pl.id, pl.list[pl.i - 1]);
}

/** Put it under the value above it. */
export function moveIn(doc: Y.Doc, v: TreeView, key: string): OpResult {
	if (!canMoveIn(v, key)) return {};
	const pl = v.placements.get(key)!;
	const prev = pl.list[pl.i - 1];
	tx(doc, v, () => {
		removeAll(listArr(doc, v, pl.parentId), pl.id);
		const t = kidsArr(doc, prev);
		if (t && !t.toArray().includes(pl.id)) t.push([pl.id]);
		if (pl.parentId) swapRank(doc, pl.id, pl.parentId, prev);
	});
	return { prefer: { id: pl.id, parent: prev }, expand: [prev] };
}

function loopMessage(v: TreeView, id: string, targetId: string) {
	return 'That would make a loop: “' + titleOf(v, targetId) + '” already grows from “' + titleOf(v, id) + '”.';
}

/** Move one spot of a value under another value, or to the root level (targetId null). */
export function moveTo(doc: Y.Doc, v: TreeView, key: string, targetId: string | null): OpResult {
	const pl = v.placements.get(key);
	if (!pl) return {};
	const id = pl.id;
	if (targetId === null) {
		if (pl.depth === 0) return {};
		tx(doc, v, () => {
			removeAllParents(doc, id);
			ensureRootOrder(doc, v);
			rootOrderOf(doc).push([id]);
		});
		return { selectKey: id };
	}
	if (targetId === pl.parentId || !v.nodes[targetId]) return {};
	if (!noLoop(v, id, targetId)) return { error: loopMessage(v, id, targetId) };
	tx(doc, v, () => {
		removeAll(listArr(doc, v, pl.parentId), id);
		const t = kidsArr(doc, targetId);
		if (t && !t.toArray().includes(id)) t.push([id]);
		if (pl.parentId) swapRank(doc, id, pl.parentId, targetId);
	});
	return { prefer: { id, parent: targetId }, expand: [targetId] };
}

/** Add another parent, keeping the existing ones. */
export function link(doc: Y.Doc, v: TreeView, id: string, targetId: string): OpResult {
	if (!v.nodes[id] || !v.nodes[targetId]) return {};
	if ((v.parentsOf.get(id) || []).includes(targetId))
		return { error: '“' + titleOf(v, id) + '” already grows from “' + titleOf(v, targetId) + '”.' };
	if (!noLoop(v, id, targetId)) return { error: loopMessage(v, id, targetId) };
	tx(doc, v, () => {
		removeAll(rootOrderOf(doc), id);
		kidsArr(doc, targetId)?.push([id]);
	});
	return {
		prefer: { id, parent: targetId },
		expand: [targetId],
		message: '“' + titleOf(v, id) + '” now also grows from “' + titleOf(v, targetId) + '”'
	};
}

/** Change which parent takes precedence (dir -1 = more, +1 = less). */
export function rerank(doc: Y.Doc, v: TreeView, id: string, parentId: string, dir: -1 | 1): OpResult {
	const ps = (v.parentsOf.get(id) || []).slice();
	const i = ps.indexOf(parentId);
	const j = i + dir;
	if (i < 0 || j < 0 || j >= ps.length) return {};
	ps[i] = ps[j];
	ps[j] = parentId;
	tx(doc, v, () => {
		const r = rankOf(yNode(doc, id)!);
		if (!r) return;
		r.delete(0, r.length);
		r.push(ps);
	});
	return {};
}

/** Stop a value growing from one of its several parents. */
export function unlink(doc: Y.Doc, v: TreeView, id: string, parentId: string, currentKey?: string | null): OpResult {
	const ps = v.parentsOf.get(id) || [];
	if (ps.length < 2 || !ps.includes(parentId)) return {};
	const keepParent = ps.filter((x) => x !== parentId)[0];
	tx(doc, v, () => removeAll(kidsArr(doc, parentId), id));
	const cur = currentKey ? v.placements.get(currentKey) : undefined;
	return { prefer: { id, parent: cur && cur.parentId !== parentId ? cur.parentId : keepParent } };
}

/**
 * Delete a value. With keepChildren its children move up into its place (under each of its
 * parents, or to the root level). Otherwise everything beneath goes too, except values that
 * still grow from somewhere that survives.
 */
export function removeNode(doc: Y.Doc, v: TreeView, key: string, keepChildren: boolean): OpResult {
	const pl = v.placements.get(key);
	if (!pl) return {};
	const id = pl.id;
	const S = keepChildren ? new Set([id]) : deletionSet(v, id);
	tx(doc, v, () => {
		const nodes = nodesOf(doc);
		if (keepChildren) {
			const kids = v.nodes[id].children.slice();
			const ps = v.parentsOf.get(id) || [];
			if (!ps.length) {
				const lift = kids.filter((k) => (v.parentsOf.get(k) || []).length === 1 && !v.roots.includes(k));
				ensureRootOrder(doc, v);
				const ro = rootOrderOf(doc);
				const i = ro.toArray().indexOf(id);
				if (i >= 0) {
					ro.delete(i, 1);
					if (lift.length) ro.insert(i, lift);
				}
			} else {
				for (const p of ps) {
					const ch = kidsArr(doc, p);
					if (!ch) continue;
					const cur = ch.toArray();
					const add = kids.filter((k) => !cur.includes(k) && noLoop(v, k, p));
					const i = cur.indexOf(id);
					if (i >= 0) {
						ch.delete(i, 1);
						if (add.length) ch.insert(i, add);
					}
				}
			}
		}
		for (const x of S) nodes.delete(x);
		const ro = rootOrderOf(doc);
		for (const x of S) removeAll(ro, x);
		nodes.forEach((n) => {
			const ch = childrenOf(n);
			if (!ch) return;
			for (const x of S) removeAll(ch, x);
		});
		// Any value left with no parent becomes a root value; keep it in the stored order.
		const has = new Set<string>();
		nodes.forEach((n) => childrenOf(n)?.forEach((c) => has.add(c)));
		const listed = new Set(ro.toArray());
		const orphans = Object.keys(v.nodes).filter((x) => !S.has(x) && !has.has(x) && !listed.has(x));
		if (orphans.length) ro.push(orphans);
	});
	return { selectKey: pl.parentKey };
}

export function setNote(doc: Y.Doc, id: string, parentId: string, text: string): void {
	const n = yNode(doc, id);
	const notes = n && notesOf(n);
	if (!notes) return;
	doc.transact(() => {
		if (text) notes.set(parentId, text);
		else notes.delete(parentId);
	}, LOCAL_ORIGIN);
}

/** Replace the whole tree (import). Undoable like any other local change. */
export function replaceTree(doc: Y.Doc, tree: PlainTree): void {
	doc.transact(() => writeTree(doc, tree), LOCAL_ORIGIN);
}
