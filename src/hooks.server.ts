import type { Handle } from '@sveltejs/kit';

/** Secret-link pages must not leak through Referer headers or caches. */
export const handle: Handle = async ({ event, resolve }) => {
	const res = await resolve(event);
	const p = event.url.pathname;
	if (p.startsWith('/e/') || p.startsWith('/v/') || p.startsWith('/api/')) {
		res.headers.set('Cache-Control', 'no-store');
	}
	res.headers.set('Referrer-Policy', 'no-referrer');
	res.headers.set('X-Content-Type-Options', 'nosniff');
	res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return res;
};
