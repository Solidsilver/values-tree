import { error, redirect } from '@sveltejs/kit';
import { resolveToken } from '$lib/server/trees.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const r = resolveToken(params.token);
	if (!r) error(404, { message: 'This link is no longer valid.', code: 'invalid-link' });
	if (r.role !== 'view') redirect(307, '/e/' + params.token);
	return { treeId: r.treeId, role: 'view' as const, title: r.title };
};
