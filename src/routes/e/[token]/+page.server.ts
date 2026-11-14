import { error, redirect } from '@sveltejs/kit';
import { resolveToken, viewTokenFor } from '$lib/server/trees.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const r = resolveToken(params.token);
	if (!r) error(404, { message: 'This link is no longer valid.', code: 'invalid-link' });
	if (r.role !== 'edit') redirect(307, '/v/' + params.token);
	return { treeId: r.treeId, role: 'edit' as const, title: r.title, viewToken: viewTokenFor(params.token) };
};
