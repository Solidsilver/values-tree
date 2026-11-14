import { error, json } from '@sveltejs/kit';
import { rotate } from '$lib/server/trees.ts';
import type { RequestHandler } from './$types';

/** Replace the view or edit link. Only edit-link holders may do this. */
export const POST: RequestHandler = async ({ params, request }) => {
	let which: unknown;
	try {
		which = (await request.json())?.which;
	} catch {
		error(400, 'Expected JSON.');
	}
	if (which !== 'edit' && which !== 'view') error(400, 'Say which link to regenerate: "edit" or "view".');
	const r = rotate(params.token, which);
	if (!r) error(404, 'This link is no longer valid.');
	return json({ which, token: r.token, editToken: r.editToken, viewToken: r.viewToken });
};
