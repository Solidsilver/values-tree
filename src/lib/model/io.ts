import { sanitizeId, str, uid } from './ids.ts';
import { DEFAULT_TITLE } from './schema.ts';
import { cutLoops, docPlan, noteOf, titleOf } from './derive.ts';
import type { PlainNode, PlainTree, TreeView } from './types.ts';

export const FORMAT = 'family-values-tree';

/**
 * Accepts every shape the original app understood: v2/v3 `{roots, nodes}` with nodes as an
 * object or array, the nested `{roots: [{title, children: [...]}]}` form, or a bare array of roots.
 * Removes links that would make a loop and derives roots as the values with no parents.
 */
export function normalize(input: unknown): PlainTree {
	let d: any = input;
	if (Array.isArray(d)) d = { roots: d };
	if (!d || typeof d !== 'object') d = {};
	const nodes: Record<string, PlainNode> = {};
	const order: string[] = [];
	const mk = (n: any, id: string): PlainNode => {
		order.push(id);
		const notes: Record<string, string> = {};
		const o = n.notes;
		if (o && typeof o === 'object' && !Array.isArray(o)) {
			for (const k of Object.keys(o)) if (typeof o[k] === 'string' && o[k]) notes[sanitizeId(k)] = o[k];
		}
		return {
			id,
			title: str(n.title != null ? n.title : n.name),
			meaning: str(n.meaning != null ? n.meaning : n.description),
			practice: str(n.practice),
			avoid: str(n.avoid != null ? n.avoid : n.notThis),
			notes,
			rank: Array.isArray(n.rank) ? n.rank.filter((r: unknown) => typeof r === 'string').map(sanitizeId) : [],
			collapsed: !!n.collapsed,
			children: []
		};
	};
	const addKid = (pid: string, cid: string) => {
		if (pid !== cid && !nodes[pid].children.includes(cid)) nodes[pid].children.push(cid);
	};
	let givenRoots: string[] = [];
	if (d.nodes && typeof d.nodes === 'object') {
		const list: any[] = Array.isArray(d.nodes)
			? d.nodes
			: Object.keys(d.nodes).map((k) => Object.assign({ id: k }, d.nodes[k]));
		const raw: Record<string, unknown[]> = {};
		for (const n of list) {
			if (!n || typeof n !== 'object') continue;
			let id = typeof n.id === 'string' && n.id && !nodes[n.id] ? sanitizeId(n.id) : uid();
			if (nodes[id]) id = uid();
			nodes[id] = mk(n, id);
			raw[id] = Array.isArray(n.children) ? n.children : [];
		}
		for (const id of Object.keys(raw)) {
			for (let c of raw[id]) {
				c = sanitizeId(c);
				if (nodes[c as string]) addKid(id, c as string);
			}
		}
		givenRoots = (Array.isArray(d.roots) ? d.roots : []).map(sanitizeId).filter((r: string) => nodes[r]);
	} else {
		// Nested form: the same id appearing in two places is one value with two parents.
		const walk = (n: any): string | null => {
			if (!n || typeof n !== 'object') return null;
			const id = typeof n.id === 'string' && n.id ? sanitizeId(n.id) : uid();
			if (!nodes[id]) nodes[id] = mk(n, id);
			const kids = (Array.isArray(n.children) ? n.children : []).map(walk).filter(Boolean) as string[];
			for (const k of kids) addKid(id, k);
			return id;
		};
		givenRoots = (Array.isArray(d.roots) ? d.roots : []).map(walk).filter(Boolean) as string[];
	}
	cutLoops(nodes, givenRoots.concat(order));
	const hasParent = new Set<string>();
	for (const id of order) for (const c of nodes[id].children) hasParent.add(c);
	const roots: string[] = [];
	for (const id of givenRoots.concat(order)) if (!hasParent.has(id) && !roots.includes(id)) roots.push(id);
	return {
		title: typeof d.title === 'string' && d.title.trim() ? d.title : DEFAULT_TITLE,
		intro: str(d.intro),
		roots,
		nodes
	};
}

export type ImportResult = { ok: true; tree: PlainTree } | { ok: false; error: string };

/** Validate and normalize pasted or uploaded JSON, with the original's messages. */
export function parseImport(text: string): ImportResult {
	const raw = text.trim();
	if (!raw) return { ok: false, error: 'Choose a file or paste the JSON first.' };
	let parsed: any;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			ok: false,
			error: 'This isn’t valid JSON. Check that you copied the whole file, including the first { and last }.'
		};
	}
	const ok =
		Array.isArray(parsed) ||
		(parsed && (Array.isArray(parsed.roots) || (parsed.nodes && typeof parsed.nodes === 'object')));
	if (!ok) return { ok: false, error: 'This JSON doesn’t look like a values tree. It needs a "roots" list.' };
	return { ok: true, tree: normalize(parsed) };
}

export interface ExportedTree {
	format: typeof FORMAT;
	version: 3;
	title: string;
	intro: string;
	exportedAt: string;
	roots: string[];
	nodes: {
		id: string;
		title: string;
		meaning: string;
		practice: string;
		avoid: string;
		rank: string[];
		notes: Record<string, string>;
		collapsed: boolean;
		children: string[];
	}[];
}

/** The full DAG as the v3 JSON file. `collapsed` comes from this viewer's local fold state. */
export function exportData(v: TreeView, collapsed: ReadonlySet<string> = new Set(), now = new Date()): ExportedTree {
	const list: ExportedTree['nodes'] = [];
	v.firstKey.forEach((_k, id) => {
		const n = v.nodes[id];
		const ps = v.parentsOf.get(id) || [];
		const notes: Record<string, string> = {};
		for (const p of ps) if (noteOf(v, id, p)) notes[p] = noteOf(v, id, p);
		list.push({
			id,
			title: n.title,
			meaning: n.meaning,
			practice: n.practice,
			avoid: n.avoid,
			rank: ps.slice(),
			notes,
			collapsed: collapsed.has(id),
			children: n.children.slice()
		});
	});
	return {
		format: FORMAT,
		version: 3,
		title: v.title,
		intro: v.intro,
		exportedAt: now.toISOString(),
		roots: v.roots.slice(),
		nodes: list
	};
}

/** A readable document, identical to the original app's Markdown export. */
export function toMarkdown(v: TreeView): string {
	const plan = docPlan(v);
	const out: string[] = ['# ' + v.title, ''];
	if (v.intro.trim()) out.push(v.intro.trim(), '');
	const one = (s: string) => s.trim().replace(/\n+/g, ' ');
	const walk = (id: string, depth: number) => {
		const n = v.nodes[id];
		const t = titleOf(v, id);
		const num = plan.num[id];
		const ps = v.parentsOf.get(id) || [];
		const shaped =
			ps.length > 1 || ps.some((x) => noteOf(v, id, x))
				? ps.map(
						(o, i) =>
							i + 1 + '. ' + titleOf(v, o) + ' (' + plan.num[o].replace(/\.$/, '') + ')' +
							(noteOf(v, id, o) ? ': ' + one(noteOf(v, id, o)) : '')
					)
				: [];
		if (depth < 5) {
			out.push('#'.repeat(depth + 2) + ' ' + num + ' ' + t, '');
			if (n.meaning.trim()) out.push(n.meaning.trim(), '');
			if (n.practice.trim()) out.push('**How we live it:** ' + n.practice.trim(), '');
			if (n.avoid.trim()) out.push('**Not this:** ' + n.avoid.trim(), '');
			if (shaped.length) out.push('**Shaped by:**', '', shaped.join('\n'), '');
		} else {
			out.push(
				'  '.repeat(depth - 5) + '- **' + num + ' ' + t + '**' +
					(n.meaning.trim() ? ': ' + one(n.meaning) : '') +
					(n.practice.trim() ? ' *How we live it:* ' + one(n.practice) : '') +
					(n.avoid.trim() ? ' *Not this:* ' + one(n.avoid) : '') +
					(shaped.length ? ' *Shaped by:* ' + shaped.map((s) => s.replace(/^\d+\. /, '')).join('; ') : '')
			);
		}
		for (const c of n.children) {
			if (plan.home[c] === id) walk(c, depth + 1);
			else out.push((depth >= 5 ? '  '.repeat(depth - 4) + '- ' : '') + '*Also includes ' + plan.num[c] + ' ' + titleOf(v, c) + '.*', '');
		}
	};
	for (const r of v.roots) walk(r, 0);
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Plain tree from a view (for "make my own copy" and replace-import round trips). */
export function viewToTree(v: TreeView, collapsed: ReadonlySet<string> = new Set()): PlainTree {
	return normalize(exportData(v, collapsed));
}

export function slug(s: string): string {
	return str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'family-values';
}
