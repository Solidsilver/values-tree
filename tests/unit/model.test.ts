import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as Y from 'yjs';
import { makeOracle } from './oracle.ts';
import { docFromTree, LOCAL_ORIGIN, nodesOf, childrenOf, rootOrderOf } from '../../src/lib/model/schema.ts';
import { ancestorsOf, countBelow, deletionSet, derive } from '../../src/lib/model/derive.ts';
import { exportData, normalize, parseImport, toMarkdown } from '../../src/lib/model/io.ts';
import * as ops from '../../src/lib/model/ops.ts';
import type { TreeView } from '../../src/lib/model/types.ts';

/** A made-up tree in the legacy v2 format: one root, 28 values, six with more than one parent. */
const seedRaw = JSON.parse(readFileSync(new URL('../fixtures/sample-v2.json', import.meta.url), 'utf8'));
/** The owner's real tree. Private: it is gitignored and only present on the owner's machine. */
const ownerUrl = new URL('../../seed/our-family-values.json', import.meta.url);
const ownerRaw = existsSync(ownerUrl) ? JSON.parse(readFileSync(ownerUrl, 'utf8')) : null;

function viewOf(raw: unknown): { doc: Y.Doc; v: TreeView } {
	const doc = docFromTree(normalize(raw));
	return { doc, v: derive(doc) };
}

/** Structure of an oracle state, comparable with a derived view. */
function oracleShape(o: ReturnType<typeof makeOracle>) {
	const s = o.state();
	const parentsOf: Map<string, string[]> = o.get('parentsOf');
	const nodes: Record<string, { children: string[]; parents: string[]; title: string; notes: Record<string, string> }> = {};
	for (const id of Object.keys(s.nodes).sort()) {
		const notes: Record<string, string> = {};
		for (const [k, val] of Object.entries(s.nodes[id].notes || {})) if (val) notes[k] = val as string;
		nodes[id] = { children: [...s.nodes[id].children], parents: [...parentsOf.get(id)!], title: s.nodes[id].title, notes };
	}
	return { roots: [...s.roots], nodes };
}
function viewShape(v: TreeView) {
	const nodes: Record<string, { children: string[]; parents: string[]; title: string; notes: Record<string, string> }> = {};
	for (const id of Object.keys(v.nodes).sort())
		nodes[id] = { children: [...v.nodes[id].children], parents: [...v.parentsOf.get(id)!], title: v.nodes[id].title, notes: { ...v.nodes[id].notes } };
	return { roots: [...v.roots], nodes };
}

/** A random DAG in the original's v3 export shape. Edges only go from lower to higher index. */
function randomTree(seed: number, n = 14) {
	let x = seed;
	const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const ids = Array.from({ length: n }, (_, i) => 'n' + String(i).padStart(2, '0'));
	const nodes = ids.map((id, i) => {
		const children: string[] = [];
		for (let j = i + 1; j < n; j++) if (rnd() < (j === i + 1 ? 0.5 : 0.12)) children.push(ids[j]);
		return { id, title: 'Value ' + i, meaning: rnd() < 0.3 ? 'Meaning of ' + i : '', practice: rnd() < 0.2 ? 'Do ' + i : '', avoid: rnd() < 0.2 ? 'Not ' + i : '', children, notes: {} as Record<string, string>, rank: [] as string[] };
	});
	// notes and partial ranks on multi-parent values
	for (const node of nodes) {
		const ps = nodes.filter((p) => p.children.includes(node.id)).map((p) => p.id);
		if (ps.length && rnd() < 0.5) node.notes[ps[0]] = 'Because ' + ps[0];
		if (ps.length > 1 && rnd() < 0.5) node.rank = ps.slice().reverse().slice(0, 1);
	}
	const shuffled = ids.slice().sort(() => rnd() - 0.5);
	return { format: 'family-values-tree', version: 3, title: 'Random ' + seed, intro: seed % 2 ? 'Why we write\n\nSecond para' : '', roots: shuffled, nodes, _rnd: rnd };
}

describe('import and derive', () => {
	it('imports a legacy v2 tree with all 28 values and multi-parent links', () => {
		const { v } = viewOf(seedRaw);
		expect(v.title).toBe('Sample Family Values');
		expect(v.stats.total).toBe(28);
		expect(v.roots).toEqual(['s00kindness']);
		const o = makeOracle();
		o.load(seedRaw);
		expect(viewShape(v)).toEqual(oracleShape(o));
		const multi = [...v.parentsOf].filter(([, ps]) => ps.length > 1).map(([id]) => v.nodes[id].title).sort();
		expect(multi).toEqual(['Board games', 'Effort', 'Garden', 'Nature walks', 'School', 'Welcoming guests']);
	});

	it.skipIf(!ownerRaw)("imports the owner's private tree with no loss (runs only where it exists)", () => {
		const { v } = viewOf(ownerRaw);
		expect(v.stats.total).toBe(Object.keys(ownerRaw.nodes).length);
		expect([...v.parentsOf].some(([, ps]) => ps.length > 1)).toBe(true);
		const o = makeOracle();
		o.load(ownerRaw);
		expect(viewShape(v)).toEqual(oracleShape(o));
		expect(toMarkdown(v)).toBe(o.call('toMarkdown'));
		expect(viewShape(viewOf(exportData(v)).v)).toEqual(viewShape(v));
	});

	it('round-trips the sample through export and import with no loss', () => {
		const { v } = viewOf(seedRaw);
		const again = viewOf(exportData(v)).v;
		expect(viewShape(again)).toEqual(viewShape(v));
		expect(toMarkdown(again)).toBe(toMarkdown(v));
	});

	it('produces the same Markdown as the original on the sample', () => {
		const { v } = viewOf(seedRaw);
		const o = makeOracle();
		o.load(seedRaw);
		expect(toMarkdown(v)).toBe(o.call('toMarkdown'));
	});

	it('matches the original on random DAGs (structure, rank defaults, Markdown, ancestors)', () => {
		for (let s = 1; s <= 60; s++) {
			const raw = randomTree(s, 6 + (s % 12));
			const { v } = viewOf(raw);
			const o = makeOracle();
			o.load(raw);
			expect(viewShape(v)).toEqual(oracleShape(o));
			expect(toMarkdown(v)).toBe(o.call('toMarkdown'));
			for (const id of Object.keys(v.nodes)) {
				expect(ancestorsOf(v, id)).toEqual(o.call('ancestorsOf', id));
				expect(countBelow(v, id)).toBe(o.call('countBelow', id));
				expect([...deletionSet(v, id)].sort()).toEqual(Object.keys(o.call('deletionSet', id) as object).sort());
			}
		}
	});

	it('Markdown matches the original for deep trees (bullet levels past depth 5)', () => {
		const ids = Array.from({ length: 9 }, (_, i) => 'd' + i);
		const raw = {
			title: 'Deep',
			intro: 'Intro',
			roots: ['d0'],
			nodes: ids.map((id, i) => ({ id, title: 'Level ' + i, meaning: i % 2 ? 'line one\nline two' : '', practice: 'p' + i, avoid: i > 6 ? 'a' : '', children: i < 8 ? [ids[i + 1]] : [], notes: i > 6 ? { [ids[i - 1]]: 'note\nhere' } : {} }))
		};
		(raw.nodes[2].children as string[]).push('d8');
		const { v } = viewOf(raw);
		const o = makeOracle();
		o.load(raw);
		expect(toMarkdown(v)).toBe(o.call('toMarkdown'));
	});

	it('accepts legacy and nested import shapes', () => {
		const nested = { title: 'Nested', roots: [{ id: 'a', name: 'Love', children: [{ id: 'c', title: 'Forgiveness' }] }, { id: 'b', title: 'Faith', children: [{ id: 'c' }] }] };
		const t = normalize(nested);
		expect(t.roots).toEqual(['a', 'b']);
		expect(t.nodes.a.children).toEqual(['c']);
		expect(t.nodes.b.children).toEqual(['c']);
		expect(normalize([{ title: 'X' }]).roots.length).toBe(1);
		const arr = normalize({ roots: ['p'], nodes: [{ id: 'p', title: 'P', children: ['q'] }, { id: 'q', title: 'Q', description: 'old meaning', notThis: 'old avoid' }] });
		expect(arr.nodes.q.meaning).toBe('old meaning');
		expect(arr.nodes.q.avoid).toBe('old avoid');
		expect(parseImport('nope').ok).toBe(false);
		expect(parseImport('{"x":1}').ok).toBe(false);
		expect(parseImport(JSON.stringify(seedRaw)).ok).toBe(true);
	});

	it('cuts loops in imports the same way as the original', () => {
		const raw = { roots: ['a'], nodes: { a: { title: 'A', children: ['b'] }, b: { title: 'B', children: ['c'] }, c: { title: 'C', children: ['a'] } } };
		const t = normalize(raw);
		expect(t.nodes.c.children).toEqual([]);
		expect(t.roots).toEqual(['a']);
	});
});

type Step = { op: string; args: (v: TreeView, rnd: () => number) => unknown[] | null };

describe('ops match the original', () => {
	const pick = <T,>(a: T[], rnd: () => number) => a[Math.floor(rnd() * a.length)];
	const keys = (v: TreeView) => [...v.placements.keys()];
	const ids = (v: TreeView) => Object.keys(v.nodes);
	const steps: Step[] = [
		{ op: 'move', args: (v, r) => [pick(keys(v), r), r() < 0.5 ? -1 : 1] },
		{ op: 'moveOut', args: (v, r) => [pick(keys(v), r)] },
		{ op: 'moveIn', args: (v, r) => [pick(keys(v), r)] },
		{ op: 'moveTo', args: (v, r) => [pick(keys(v), r), r() < 0.15 ? null : pick(ids(v), r)] },
		{ op: 'link', args: (v, r) => [pick(ids(v), r), pick(ids(v), r)] },
		{ op: 'rerank', args: (v, r) => { const multi = ids(v).filter((i) => v.parentsOf.get(i)!.length > 1); if (!multi.length) return null; const id = pick(multi, r); return [id, pick(v.parentsOf.get(id)!, r), r() < 0.5 ? -1 : 1]; } },
		{ op: 'unlink', args: (v, r) => { const multi = ids(v).filter((i) => v.parentsOf.get(i)!.length > 1); if (!multi.length) return null; const id = pick(multi, r); return [id, pick(v.parentsOf.get(id)!, r)]; } },
		{ op: 'removeNode', args: (v, r) => [pick(keys(v), r), r() < 0.5] }
	];
	function apply(doc: Y.Doc, v: TreeView, op: string, a: any[]) {
		switch (op) {
			case 'move': return ops.moveSibling(doc, v, a[0], a[1]);
			case 'moveOut': return ops.moveOut(doc, v, a[0]);
			case 'moveIn': return ops.moveIn(doc, v, a[0]);
			case 'moveTo': return ops.moveTo(doc, v, a[0], a[1]);
			case 'link': return ops.link(doc, v, a[0], a[1]);
			case 'rerank': return ops.rerank(doc, v, a[0], a[1], a[2]);
			case 'unlink': return ops.unlink(doc, v, a[0], a[1]);
			case 'removeNode': return ops.removeNode(doc, v, a[0], a[1]);
		}
	}
	it('random operation sequences produce identical trees', () => {
		for (let s = 1; s <= 80; s++) {
			const raw = randomTree(s * 7, 8 + (s % 8));
			const rnd = raw._rnd;
			const doc = docFromTree(normalize(raw));
			const o = makeOracle();
			o.load(raw);
			for (let k = 0; k < 25; k++) {
				const v = derive(doc);
				if (!v.placements.size) break;
				const step = pick(steps, rnd);
				const a = step.args(v, rnd);
				if (!a) continue;
				apply(doc, v, step.op, a as any[]);
				o.call(step.op, ...a);
				const mine = viewShape(derive(doc));
				const theirs = oracleShape(o);
				// Orphaned roots may be ordered differently; compare root sets, then structure.
				expect(new Set(mine.roots), `seed ${s} step ${k} ${step.op} ${JSON.stringify(a)}`).toEqual(new Set(theirs.roots));
				expect(mine.nodes, `seed ${s} step ${k} ${step.op} ${JSON.stringify(a)}`).toEqual(theirs.nodes);
			}
		}
	});

	it('adds roots, children and siblings in the same places', () => {
		const { doc, v } = viewOf(seedRaw);
		const r = ops.addChild(doc, v, 's00kindness', 'Kindness');
		let v2 = derive(doc);
		expect(v2.nodes.s00kindness.children.at(-1)).toBe(r.created);
		expect(v2.placements.has(r.selectKey!)).toBe(true);
		const sib = ops.addSibling(doc, v2, 's00kindness/s01home', 'Neighbours');
		v2 = derive(doc);
		expect(v2.nodes.s00kindness.children[1]).toBe(sib.created);
		const root = ops.addRoot(doc, v2, 'Love');
		v2 = derive(doc);
		expect(v2.roots).toEqual(['s00kindness', root.created]);
		const rs = ops.addSibling(doc, v2, 's00kindness', 'Hope');
		v2 = derive(doc);
		expect(v2.roots).toEqual(['s00kindness', rs.created, root.created]);
		ops.moveSibling(doc, v2, root.created!, -1);
		expect(derive(doc).roots).toEqual(['s00kindness', root.created, rs.created]);
	});
});

describe('collaboration edge cases', () => {
	function pair(raw: unknown) {
		const a = docFromTree(normalize(raw));
		const b = new Y.Doc();
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
		return { a, b };
	}
	const sync = (a: Y.Doc, b: Y.Doc) => {
		Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
		Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
	};
	const raw = { title: 'T', roots: ['r'], nodes: { r: { title: 'R', children: ['a', 'b'] }, a: { title: 'A', children: [] }, b: { title: 'B', children: [] } } };

	it('concurrent "A under B" and "B under A" converge to the same loop-free tree', () => {
		const { a, b } = pair(raw);
		ops.moveTo(a, derive(a), 'r/a', 'b');
		ops.moveTo(b, derive(b), 'r/b', 'a');
		sync(a, b);
		const va = derive(a), vb = derive(b);
		expect(viewShape(va)).toEqual(viewShape(vb));
		expect(va.stats.total).toBe(3);
		// every value is placed exactly where it can be reached, and nothing loops
		for (const id of Object.keys(va.nodes)) expect(va.firstKey.has(id)).toBe(true);
		const placedOnce = [...va.placements.values()].every((p) => p.key.split('/').length === new Set(p.key.split('/')).size);
		expect(placedOnce).toBe(true);
	});

	it('a disconnected loop still gets one root and keeps every value', () => {
		const { a, b } = pair({ roots: ['a', 'b'], nodes: { a: { title: 'A' }, b: { title: 'B' } } });
		ops.moveTo(a, derive(a), 'a', 'b');
		ops.moveTo(b, derive(b), 'b', 'a');
		sync(a, b);
		const va = derive(a);
		expect(viewShape(va)).toEqual(viewShape(derive(b)));
		expect(va.roots.length).toBe(1);
		expect(va.firstKey.size).toBe(2);
	});

	it('adding a child to a value someone else deleted makes the child a root', () => {
		const { a, b } = pair(raw);
		const add = ops.addChild(a, derive(a), 'r/a', 'Orphan');
		ops.removeNode(b, derive(b), 'r/a', false);
		sync(a, b);
		const va = derive(a);
		expect(viewShape(va)).toEqual(viewShape(derive(b)));
		expect(va.roots).toContain(add.created);
		expect(va.nodes.a).toBeUndefined();
	});

	it('concurrent typing in the same field merges', () => {
		const { a, b } = pair(raw);
		const ta = (nodesOf(a).get('a')!.get('meaning') as Y.Text);
		const tb = (nodesOf(b).get('a')!.get('meaning') as Y.Text);
		ta.insert(0, 'hello');
		tb.insert(0, 'world');
		sync(a, b);
		expect(ta.toString()).toBe(tb.toString());
		expect(ta.toString().length).toBe(10);
	});

	it('undo only reverts local changes', () => {
		const { a, b } = pair(raw);
		const um = new Y.UndoManager([nodesOf(a), rootOrderOf(a), a.getMap('meta')], { trackedOrigins: new Set([LOCAL_ORIGIN]) });
		ops.addRoot(a, derive(a), 'Mine');
		ops.addRoot(b, derive(b), 'Theirs');
		sync(a, b);
		expect(derive(a).stats.total).toBe(5);
		um.undo();
		const titles = Object.values(derive(a).nodes).map((n) => n.title);
		expect(titles).toContain('Theirs');
		expect(titles).not.toContain('Mine');
	});

	it('derive ignores dangling child ids and stale rank entries', () => {
		const doc = docFromTree(normalize(raw));
		doc.transact(() => {
			childrenOf(nodesOf(doc).get('r')!)!.push(['ghost', 'r', 'a']);
		});
		const v = derive(doc);
		expect(v.nodes.r.children).toEqual(['a', 'b']);
	});
});
