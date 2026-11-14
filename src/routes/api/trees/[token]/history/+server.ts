import { error, json } from '@sveltejs/kit';
import { resolveToken } from '$lib/server/trees.ts';
import { checkpoint, listVersions } from '$lib/server/history.ts';
import type { RequestHandler } from './$types';

/**
 * Version history is for edit-link holders only: older versions can contain values an editor
 * removed on purpose, and a view link should not reveal them.
 */
function editor(token: string) {
	const r = resolveToken(token);
	if (!r || r.role !== 'edit') error(404, 'This link is no longer valid.');
	return r;
}

/** List saved versions, newest first. */
export const GET: RequestHandler = ({ params }) => {
	const r = editor(params.token);
	return json({ versions: listVersions(r.treeId) });
};

/** Save the current tree as a version now (the client calls this right before restoring). */
export const POST: RequestHandler = ({ params }) => {
	const r = editor(params.token);
	return json({ id: checkpoint(r.treeId) });
};
