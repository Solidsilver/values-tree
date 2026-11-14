import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin, ViteDevServer } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Dev only: attach the Yjs sync server to Vite's HTTP server. The module is loaded through the
 * SSR module graph so SvelteKit routes and the sync server share one module instance.
 * Only `/ws/` upgrades are handled; Vite's own HMR socket is left alone.
 */
function syncServer(): Plugin {
	return {
		name: 'values-tree-sync',
		configureServer(server: ViteDevServer) {
			server.httpServer?.on('upgrade', async (req, socket, head) => {
				if (!req.url?.startsWith('/ws/')) return;
				try {
					const mod = await server.ssrLoadModule('/src/lib/server/sync.ts');
					mod.handleUpgrade(req, socket, head);
				} catch (err) {
					console.error('[sync] failed to load sync server', err);
					socket.destroy();
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), syncServer()],
	test: {
		include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
		environment: 'node'
	}
});
