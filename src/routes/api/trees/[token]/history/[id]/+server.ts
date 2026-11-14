import { error, json } from '@sveltejs/kit';
import { resolveToken } from '$lib/server/trees.ts';
import { getVersion } from '$lib/server/history.ts';
import type { RequestHandler } from './$types';

/** One saved version, with its full tree, for preview and restore. Edit links only. */
export const GET: RequestHandler = ({ params }) => {
	const r = resolveToken(params.token);
	if (!r || r.role !== 'edit') error(404, 'This link is no longer valid.');
	const id = Number(params.id);
	const v = Number.isSafeInteger(id) && id > 0 ? getVersion(r.treeId, id) : null;
	if (!v) error(404, 'That version no longer exists.');
	return json(v);
};
