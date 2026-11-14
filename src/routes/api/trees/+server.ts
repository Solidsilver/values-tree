import { error, json } from '@sveltejs/kit';
import { createTree } from '$lib/server/trees.ts';
import { tokenBucket } from '$lib/server/ratelimit.ts';
import { normalize } from '$lib/model/io.ts';
import { blankTree, exampleTree } from '$lib/model/example.ts';
import type { RequestHandler } from './$types';

const limiter = tokenBucket({ capacity: 10, refillPerMinute: 6 });
const MAX_VALUES = 2000;

/** Create a tree: { source: 'blank' | 'example' | 'import', tree? } -> { editToken, viewToken } */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!limiter.take(getClientAddress())) error(429, 'Too many new trees from this address. Try again in a few minutes.');
	let body: any;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON.');
	}
	const source = body?.source;
	let tree;
	if (source === 'blank') tree = blankTree();
	else if (source === 'example') tree = exampleTree();
	else if (source === 'import') {
		const raw = body.tree;
		const ok = Array.isArray(raw) || (raw && (Array.isArray(raw.roots) || (raw.nodes && typeof raw.nodes === 'object')));
		if (!ok) error(400, 'This doesn’t look like a values tree.');
		tree = normalize(raw);
		if (Object.keys(tree.nodes).length > MAX_VALUES) error(413, 'That tree is too large to import.');
	} else error(400, 'Unknown source.');
	const created = createTree(tree);
	return json({ editToken: created.editToken, viewToken: created.viewToken, title: tree.title });
};
