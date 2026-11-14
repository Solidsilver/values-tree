import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4319;
const dataDir = process.env.E2E_DATA_DIR || mkdtempSync(join(tmpdir(), 'values-tree-e2e-'));

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	fullyParallel: true,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
	webServer: {
		command: 'npm run build && node server.ts',
		url: `http://localhost:${PORT}/healthz`,
		reuseExistingServer: false,
		timeout: 120_000,
		env: { PORT: String(PORT), DATA_DIR: dataDir, ORIGIN: `http://localhost:${PORT}` }
	}
});
