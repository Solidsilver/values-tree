import { getDb } from '$lib/server/db.ts';

export function GET() {
	getDb().exists('healthz');
	return new Response('ok', { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
}
