/**
 * Production entry: SvelteKit (adapter-node) + the Yjs WebSocket sync server on one port.
 *   node server.ts        (Node 22.18+ for type stripping)
 * Env: PORT (3000), HOST (0.0.0.0), DATA_DIR (./data), ORIGIN / PROTOCOL_HEADER / HOST_HEADER
 * as documented by adapter-node when running behind a proxy.
 */
import { createServer } from 'node:http';
import { handleUpgrade, flushAll, closeAll } from './src/lib/server/sync.ts';
import { getDb } from './src/lib/server/db.ts';

// @ts-ignore: produced by `vite build`
const { handler } = await import('./build/handler.js');

getDb(); // open (and migrate) the database before accepting traffic

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

const server = createServer((req, res) =>
	handler(req, res, () => {
		res.statusCode = 404;
		res.end('Not found');
	})
);
server.on('upgrade', (req, socket, head) => {
	if (req.url?.startsWith('/ws/')) handleUpgrade(req, socket, head);
	else socket.destroy();
});

server.listen(port, host, () => {
	console.log(`values-tree listening on http://${host}:${port}`);
});

let stopping = false;
function shutdown(signal: string) {
	if (stopping) return;
	stopping = true;
	console.log(`${signal}: saving trees and shutting down`);
	try {
		flushAll();
		closeAll();
	} catch (err) {
		console.error(err);
	}
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
