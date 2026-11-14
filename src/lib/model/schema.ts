import * as Y from 'yjs';
import type { PlainNode, PlainTree } from './types.ts';

/**
 * Yjs layout of one tree:
 *   meta:      Y.Map { title: Y.Text, intro: Y.Text, schema: 3 }
 *   nodes:     Y.Map<id, Y.Map { title, meaning, practice, avoid: Y.Text,
 *                                  children: Y.Array<string>, rank: Y.Array<string>,
 *                                  notes: Y.Map<string> }>
 *   rootOrder: Y.Array<string>   preferred order of roots; roots themselves are derived.
 */
export const SCHEMA_VERSION = 3;
export const DEFAULT_TITLE = 'Our Family Values';
export const TEXT_FIELDS = ['title', 'meaning', 'practice', 'avoid'] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

/** Origin for every local user mutation; the UndoManager tracks only this origin. */
export const LOCAL_ORIGIN: { readonly name: 'local' } = Object.freeze({ name: 'local' as const });

export type YNode = Y.Map<unknown>;

export const metaOf = (doc: Y.Doc) => doc.getMap<unknown>('meta');
export const nodesOf = (doc: Y.Doc) => doc.getMap<YNode>('nodes');
export const rootOrderOf = (doc: Y.Doc) => doc.getArray<string>('rootOrder');

export function textOf(m: Y.Map<unknown> | undefined, field: string): Y.Text | undefined {
	const t = m?.get(field);
	return t instanceof Y.Text ? t : undefined;
}
export function childrenOf(n: YNode): Y.Array<string> | undefined {
	const a = n.get('children');
	return a instanceof Y.Array ? (a as Y.Array<string>) : undefined;
}
export function rankOf(n: YNode): Y.Array<string> | undefined {
	const a = n.get('rank');
	return a instanceof Y.Array ? (a as Y.Array<string>) : undefined;
}
export function notesOf(n: YNode): Y.Map<string> | undefined {
	const m = n.get('notes');
	return m instanceof Y.Map ? (m as Y.Map<string>) : undefined;
}

/** A fresh Y.Map for a value. Must be integrated into the doc inside a transaction. */
export function makeNode(p: Partial<PlainNode> = {}): YNode {
	const m = new Y.Map<unknown>();
	for (const f of TEXT_FIELDS) m.set(f, new Y.Text(p[f] ?? ''));
	const children = new Y.Array<string>();
	if (p.children?.length) children.push(p.children);
	m.set('children', children);
	const rank = new Y.Array<string>();
	if (p.rank?.length) rank.push(p.rank);
	m.set('rank', rank);
	const notes = new Y.Map<string>();
	for (const [k, v] of Object.entries(p.notes ?? {})) if (v) notes.set(k, v);
	m.set('notes', notes);
	return m;
}

/** Write a plain tree into an (empty or to-be-cleared) doc. Call inside a transaction. */
export function writeTree(doc: Y.Doc, tree: PlainTree): void {
	const meta = metaOf(doc);
	const title = textOf(meta, 'title');
	const intro = textOf(meta, 'intro');
	if (title) {
		title.delete(0, title.length);
		title.insert(0, tree.title);
	} else meta.set('title', new Y.Text(tree.title));
	if (intro) {
		intro.delete(0, intro.length);
		intro.insert(0, tree.intro);
	} else meta.set('intro', new Y.Text(tree.intro));
	meta.set('schema', SCHEMA_VERSION);

	const nodes = nodesOf(doc);
	for (const id of Array.from(nodes.keys())) nodes.delete(id);
	for (const n of Object.values(tree.nodes)) nodes.set(n.id, makeNode(n));

	const order = rootOrderOf(doc);
	if (order.length) order.delete(0, order.length);
	if (tree.roots.length) order.push(tree.roots);
}

/** Build a complete doc from a plain tree (used by the server when creating a tree). */
export function docFromTree(tree: PlainTree): Y.Doc {
	const doc = new Y.Doc();
	doc.transact(() => writeTree(doc, tree));
	return doc;
}

/** Ids of nodes that have a non-empty `collapsed` flag in an import, for local fold state. */
export function collapsedIds(tree: PlainTree): string[] {
	return Object.values(tree.nodes)
		.filter((n) => n.collapsed)
		.map((n) => n.id);
}
