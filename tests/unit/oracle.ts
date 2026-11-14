/**
 * Loads the original app's pure logic straight out of reference/original-artifact.html so the
 * port can be checked against it. DOM-touching helpers are stubbed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../../reference/original-artifact.html', import.meta.url)), 'utf8');
const js = html.slice(html.indexOf('<script id="app-js">'));

function extract(name: string): string {
	const start = js.indexOf('function ' + name + '(');
	if (start < 0) throw new Error('missing ' + name);
	let i = js.indexOf('{', start);
	let depth = 0;
	for (; i < js.length; i++) {
		if (js[i] === '{') depth++;
		else if (js[i] === '}' && --depth === 0) break;
	}
	return js.slice(start, i + 1);
}

const NAMES = [
	'str', 'uid', 'sanitize', 'normalize', 'keyOf', 'node', 'titleOf', 'reindex', 'countBelow', 'reaches',
	'noLoop', 'newNode', 'sortParents', 'noteOf', 'ancestorsOf', 'docPlan', 'toMarkdown', 'exportData',
	'addRoot', 'addChild', 'addSibling', 'move', 'removeAllParents', 'swapRank', 'moveOut', 'moveIn',
	'moveTo', 'link', 'rerank', 'unlink', 'deletionSet', 'removeNode'
];

export interface Oracle {
	load(data: unknown): void;
	state(): any;
	call(name: string, ...args: unknown[]): unknown;
	get(name: 'placements' | 'parentsOf' | 'firstKey' | 'selectedKey' | 'prefer'): any;
}

export function makeOracle(): Oracle {
	const src = `
		var state, placements = new Map(), parentsOf = new Map(), firstKey = new Map();
		var selectedId = null, selectedKey = null, prefer = null;
		function commit(fn) { fn(); reindex(); }
		function afterAdd() {}
		function toast() {}
		${NAMES.map(extract).join('\n')}
		globalThis.__api = {
			load: function (d) { state = normalize(d); selectedKey = null; selectedId = null; reindex(); },
			state: function () { return state; },
			call: function (name, args) { return eval(name).apply(null, args); },
			get: function (n) { return eval(n); }
		};`;
	const ctx: any = { Math, Date, JSON, Object, Array, Map, String, Number, isFinite };
	vm.createContext(ctx);
	vm.runInContext(src, ctx);
	const api = ctx.__api;
	return {
		load: (d) => api.load(JSON.parse(JSON.stringify(d))),
		state: () => api.state(),
		call: (name, ...args) => api.call(name, args),
		get: (n) => api.get(n)
	};
}
