import type * as Y from 'yjs';
import {
	DEFAULT_TITLE,
	childrenOf,
	metaOf,
	nodesOf,
	notesOf,
	rankOf,
	rootOrderOf,
	textOf
} from './schema.ts';
import type { Placement, TreeStats, TreeView, ViewNode } from './types.ts';

export const keyOf = (parentKey: string | null, id: string) =>
	parentKey ? parentKey + '/' + id : id;

/**
 * Turn the shared doc into plain view state. Pure: never mutates the doc.
 *
 * Concurrent edits can leave the doc in shapes a single user could never create
 * (dangling child ids, loops from two crossing moves). Every client cuts these the
 * same way because the walk order depends only on doc content.
 */
export function derive(doc: Y.Doc): TreeView {
	const meta = metaOf(doc);
	const yNodes = nodesOf(doc);
	const ids = Array.from(yNodes.keys()).sort();
	const exists = new Set(ids);

	const nodes: Record<string, ViewNode> = {};
	const rankRaw: Record<string, string[]> = {};
	for (const id of ids) {
		const n = yNodes.get(id)!;
		const kids: string[] = [];
		for (const c of childrenOf(n)?.toArray() ?? []) {
			if (typeof c === 'string' && c !== id && exists.has(c) && !kids.includes(c)) kids.push(c);
		}
		const notes: Record<string, string> = {};
		notesOf(n)?.forEach((v, k) => {
			if (typeof v === 'string' && v) notes[k] = v;
		});
		nodes[id] = {
			id,
			title: textOf(n, 'title')?.toString() ?? '',
			meaning: textOf(n, 'meaning')?.toString() ?? '',
			practice: textOf(n, 'practice')?.toString() ?? '',
			avoid: textOf(n, 'avoid')?.toString() ?? '',
			notes,
			children: kids
		};
		rankRaw[id] = (rankOf(n)?.toArray() ?? []).filter((x) => typeof x === 'string');
	}

	const order: string[] = [];
	for (const r of rootOrderOf(doc).toArray()) {
		if (typeof r === 'string' && exists.has(r) && !order.includes(r)) order.push(r);
	}

	cutLoops(nodes, order.concat(ids));

	const hasParent = new Set<string>();
	for (const id of ids) for (const c of nodes[id].children) hasParent.add(c);
	const roots: string[] = [];
	for (const id of order.concat(ids)) if (!hasParent.has(id) && !roots.includes(id)) roots.push(id);

	const title = textOf(meta, 'title')?.toString() ?? '';
	const intro = textOf(meta, 'intro')?.toString() ?? '';
	return buildView({ title: title.trim() ? title : DEFAULT_TITLE, intro, roots, nodes }, rankRaw);
}

/** The original normalize()'s DFS: drop any child link that points back into the current path. */
export function cutLoops(nodes: Record<string, { children: string[] }>, startOrder: string[]): void {
	const color: Record<string, 1 | 2> = {};
	const dfs = (id: string) => {
		color[id] = 1;
		nodes[id].children = nodes[id].children.filter((c) => {
			if (color[c] === 1) return false;
			if (!color[c]) dfs(c);
			return true;
		});
		color[id] = 2;
	};
	for (const id of startOrder) if (nodes[id] && !color[id]) dfs(id);
}

/** reindex() + sortParents() from the original, as a pure function. */
export function buildView(
	base: { title: string; intro: string; roots: string[]; nodes: Record<string, ViewNode> },
	rankRaw: Record<string, string[]>
): TreeView {
	const { nodes, roots } = base;
	const placements = new Map<string, Placement>();
	const parentsOf = new Map<string, string[]>();
	const firstKey = new Map<string, string>();
	for (const id of Object.keys(nodes)) parentsOf.set(id, []);

	const walk = (list: string[], parentId: string | null, parentKey: string | null, depth: number, ri: number) => {
		list.forEach((id, i) => {
			const key = keyOf(parentKey, id);
			const r = depth === 0 ? i : ri;
			placements.set(key, { key, id, parentId, parentKey, list, i, depth, rootIdx: r });
			if (!firstKey.has(id)) firstKey.set(id, key);
			if (parentId) {
				const a = parentsOf.get(id)!;
				if (!a.includes(parentId)) a.push(parentId);
			}
			walk(nodes[id].children, id, key, depth + 1, r);
		});
	};
	walk(roots, null, null, 0, 0);

	// sortParents: saved rank first, then "higher in the tree comes first".
	const lvl: Record<string, number> = {};
	const level = (x: string): number => {
		if (lvl[x] != null) return lvl[x];
		lvl[x] = 0;
		const ps = parentsOf.get(x) || [];
		lvl[x] = ps.length ? 1 + Math.max(...ps.map(level)) : 0;
		return lvl[x];
	};
	parentsOf.forEach((ps, id) => {
		const r = (rankRaw[id] || []).filter((x, i, a) => ps.includes(x) && a.indexOf(x) === i);
		ps.map((x, i) => ({ x, i }))
			.filter((o) => !r.includes(o.x))
			.sort((a, b) => level(a.x) - level(b.x) || a.i - b.i)
			.forEach((o) => r.push(o.x));
		ps.sort((a, b) => r.indexOf(a) - r.indexOf(b));
	});

	let deepest = 0;
	let shared = 0;
	placements.forEach((p) => (deepest = Math.max(deepest, p.depth + 1)));
	parentsOf.forEach((ps) => {
		if (ps.length > 1) shared++;
	});
	const stats: TreeStats = { roots: roots.length, total: Object.keys(nodes).length, deepest, shared };

	return { ...base, parentsOf, placements, firstKey, stats };
}

/* ---------- Queries on a view (ported from the original) ---------- */

export function titleOf(v: TreeView, id: string | null | undefined): string {
	return (id && v.nodes[id]?.title) || 'Untitled value';
}

export function noteOf(v: TreeView, id: string, parentId: string): string {
	return v.nodes[id]?.notes[parentId] || '';
}

export function countBelow(v: TreeView, id: string): number {
	const seen = new Set<string>();
	const st = [...(v.nodes[id]?.children ?? [])];
	let c = 0;
	while (st.length) {
		const x = st.pop()!;
		if (seen.has(x)) continue;
		seen.add(x);
		c++;
		st.push(...v.nodes[x].children);
	}
	return c;
}

export function reaches(v: TreeView, from: string, to: string): boolean {
	const seen = new Set<string>();
	const st = [from];
	while (st.length) {
		const x = st.pop()!;
		if (x === to) return true;
		if (seen.has(x)) continue;
		seen.add(x);
		st.push(...(v.nodes[x]?.children ?? []));
	}
	return false;
}

/** Can `child` be placed under `parent` without making a loop? */
export function noLoop(v: TreeView, child: string, parent: string): boolean {
	return child !== parent && !reaches(v, child, parent);
}

/** Every value above this one, highest precedence first. */
export function ancestorsOf(v: TreeView, id: string): string[] {
	const lvl: Record<string, number> = {};
	const level = (x: string): number => {
		if (lvl[x] != null) return lvl[x];
		const ps = v.parentsOf.get(x) || [];
		lvl[x] = ps.length ? 1 + Math.max(...ps.map(level)) : 0;
		return lvl[x];
	};
	const seen = new Set<string>();
	const list: string[] = [];
	const st = [...(v.parentsOf.get(id) || [])];
	while (st.length) {
		const x = st.shift()!;
		if (seen.has(x)) continue;
		seen.add(x);
		list.push(x);
		st.push(...(v.parentsOf.get(x) || []));
	}
	const order = Array.from(v.firstKey.keys());
	list.sort((a, b) => level(a) - level(b) || order.indexOf(a) - order.indexOf(b));
	return list;
}

/**
 * Which values go if this one is deleted with everything under it?
 * A value under it survives if it also grows from somewhere that isn't being deleted.
 */
export function deletionSet(v: TreeView, id: string): Set<string> {
	const S = new Set([id]);
	let changed = true;
	while (changed) {
		changed = false;
		for (const x of Object.keys(v.nodes)) {
			if (S.has(x)) continue;
			const ps = v.parentsOf.get(x) || [];
			if (ps.length && ps.every((p) => S.has(p))) {
				S.add(x);
				changed = true;
			}
		}
	}
	return S;
}

export type Kind = 'Root value' | 'Branch' | 'Leaf';
export function kindOf(v: TreeView, id: string, depth: number): Kind {
	return depth === 0 ? 'Root value' : v.nodes[id]?.children.length ? 'Branch' : 'Leaf';
}

export function alsoText(v: TreeView, others: string[]): string {
	if (!others.length) return '';
	return (
		'Also grows from ' +
		titleOf(v, others[0]) +
		(others.length > 1 ? ' and ' + (others.length - 1) + ' more' : '')
	);
}

/** Document numbering: each value is written out in full once, under its top-ranked parent. */
export interface DocPlan {
	num: Record<string, string>;
	home: Record<string, string | null>;
}
export function docPlan(v: TreeView): DocPlan {
	const num: Record<string, string> = {};
	const home: Record<string, string | null> = {};
	const walk = (list: string[], parentId: string | null, prefix: string) => {
		let c = 0;
		for (const id of list) {
			if (num[id]) continue;
			const top = (v.parentsOf.get(id) || [])[0] || null;
			if (top !== parentId) continue;
			c++;
			num[id] = prefix + c + '.';
			home[id] = parentId;
			walk(v.nodes[id].children, id, num[id]);
		}
	};
	walk(v.roots, null, '');
	return { num, home };
}

/** Values in tree order (first appearance), with depth, for pickers. */
export function outline(v: TreeView): { id: string; depth: number }[] {
	return Array.from(v.firstKey, ([id, k]) => ({ id, depth: v.placements.get(k)!.depth }));
}

export function emptyView(): TreeView {
	return buildView({ title: DEFAULT_TITLE, intro: '', roots: [], nodes: {} }, {});
}
