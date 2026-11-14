import { expect, test, type Browser, type Page } from '@playwright/test';

async function newTree(page: Page, source: 'blank' | 'example' = 'example') {
	const res = await page.request.post('/api/trees', { data: { source } });
	expect(res.ok()).toBe(true);
	return (await res.json()) as { editToken: string; viewToken: string };
}

/** Open a link in a fresh browser context with a chosen display name. */
async function open(browser: Browser, path: string, name: string) {
	const ctx = await browser.newContext();
	await ctx.addInitScript((n) => {
		localStorage.setItem('vt:identity', JSON.stringify({ name: n, color: '#1d4ed8', chosen: true }));
	}, name);
	const page = await ctx.newPage();
	await page.goto(path);
	await expect(page.getByRole('status').filter({ hasText: /Saved|Live/ })).toBeVisible();
	return page;
}

const card = (page: Page, title: string) => page.getByRole('treeitem', { name: new RegExp('^' + title) }).first();

test('landing: start a blank tree and add values with the keyboard', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Start a new tree' }).click();
	await expect(page).toHaveURL(/\/e\/[A-Za-z0-9_-]{22}$/);
	await page.locator('#display-name').fill('Tester');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Save your edit link.')).toBeVisible();
	await page.getByRole('button', { name: 'Add a root value' }).first().click();
	await page.keyboard.type('Love');
	await page.keyboard.press('Enter');
	await page.keyboard.press('c');
	await page.keyboard.type('Kindness');
	await page.keyboard.press('Enter');
	await expect(card(page, 'Kindness')).toBeVisible();
	await page.keyboard.press('n');
	await page.keyboard.type('Patience');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Alt+ArrowUp');
	const titles = await page.locator('.card .title').allTextContents();
	expect(titles).toEqual(['Love', 'Patience', 'Kindness']);
	await page.keyboard.press('ControlOrMeta+z');
	await expect(page.locator('.card .title')).toHaveText(['Love', 'Kindness', 'Patience']);
	// the tree is remembered on this device
	await page.goto('/');
	await expect(page.getByRole('link', { name: /Our Family Values/ })).toBeVisible();
});

test('two editors converge on typing and moves, with presence', async ({ browser, page }) => {
	const t = await newTree(page);
	const a = await open(browser, '/e/' + t.editToken, 'Ann');
	const b = await open(browser, '/e/' + t.editToken, 'Ben');

	await card(a, 'Kindness').click();
	await card(b, 'Kindness').click();
	await expect(a.locator('.card.has-peers .peer-tag')).toHaveText('Ben');

	const fa = a.locator('#f-meaning');
	const fb = b.locator('#f-meaning');
	await fa.click();
	await fa.press('End');
	await fb.click();
	await fb.press('End');
	await Promise.all([fa.pressSequentially(' Alpha', { delay: 20 }), fb.pressSequentially(' Beta', { delay: 23 })]);
	await expect.poll(async () => (await fa.inputValue()) === (await fb.inputValue())).toBe(true);
	const merged = await fa.inputValue();
	expect(merged).toContain('Alpha');
	expect(merged).toContain('Beta');

	// A moves Kindness under Honesty; B sees it
	await a.locator('details', { hasText: 'Arrange' }).locator('summary').click();
	await a.locator('#f-move').selectOption({ label: 'Honesty' });
	await expect(b.locator('.card[data-key$="ex-honesty/ex-kindness"]')).toBeVisible();
	await expect(b.locator('.card[data-key="ex-love/ex-kindness"]')).toHaveCount(0);
	// both render the same tree
	const keys = async (p: Page) => (await p.locator('.card').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))).sort();
	await expect.poll(async () => JSON.stringify(await keys(a)) === JSON.stringify(await keys(b))).toBe(true);
	await a.context().close();
	await b.context().close();
});

test('view link is read-only in the UI and cannot change the tree', async ({ browser, page }) => {
	const t = await newTree(page);
	const viewer = await open(browser, '/v/' + t.viewToken, 'Vic');
	const editor = await open(browser, '/e/' + t.editToken, 'Ed');
	await expect(viewer.getByText('You’re viewing.')).toBeVisible();
	await card(viewer, 'Love').click();
	await expect(viewer.locator('#f-title')).toHaveJSProperty('readOnly', true);
	await expect(viewer.getByRole('button', { name: 'Add a value under this' })).toHaveCount(0);
	const before = await viewer.locator('.card').count();
	await viewer.keyboard.press('c');
	await viewer.waitForTimeout(300);
	await expect(viewer.locator('.card')).toHaveCount(before);
	// edits from the editor arrive live
	await card(editor, 'Love').click();
	await editor.keyboard.press('c');
	await editor.keyboard.type('Gentleness');
	await editor.keyboard.press('Enter');
	await expect(card(viewer, 'Gentleness')).toBeVisible();
	await expect(viewer.getByText(/Ed added/).first()).toBeAttached();
	await viewer.context().close();
	await editor.context().close();
});

test('offline edits sync on reconnect', async ({ browser, page }) => {
	const t = await newTree(page);
	const a = await open(browser, '/e/' + t.editToken, 'Ann');
	const b = await open(browser, '/e/' + t.editToken, 'Ben');
	await a.context().setOffline(true);
	await expect(a.getByText(/Offline: changes saved on this device|Reconnecting/)).toBeVisible({ timeout: 15_000 });
	await card(a, 'Curiosity').click();
	await a.keyboard.press('c');
	await a.keyboard.type('Museums');
	await a.keyboard.press('Enter');
	await card(b, 'Honesty').click();
	await b.keyboard.press('c');
	await b.keyboard.type('Owning mistakes');
	await b.keyboard.press('Enter');
	await a.context().setOffline(false);
	await expect(card(b, 'Museums')).toBeVisible({ timeout: 15_000 });
	await expect(card(a, 'Owning mistakes')).toBeVisible({ timeout: 15_000 });
	await a.context().close();
	await b.context().close();
});

test('regenerating the view link signs out viewers', async ({ browser, page }) => {
	const t = await newTree(page);
	const viewer = await open(browser, '/v/' + t.viewToken, 'Vic');
	const editor = await open(browser, '/e/' + t.editToken, 'Ed');
	await editor.getByRole('button', { name: 'Share' }).click();
	await editor.getByRole('button', { name: 'Regenerate view link…' }).click();
	await editor.getByRole('button', { name: 'Make a new view link' }).click();
	await expect(viewer.getByText('This link no longer works.')).toBeVisible();
	await expect(editor.getByLabel('View-only link')).not.toHaveValue(new RegExp(t.viewToken));
	const res = await page.goto('/v/' + t.viewToken);
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'This link no longer works' })).toBeVisible();
	await viewer.context().close();
	await editor.context().close();
});

test('secret pages send no-referrer and no-store', async ({ page }) => {
	const t = await newTree(page);
	const res = await page.request.get('/e/' + t.editToken);
	expect(res.headers()['referrer-policy']).toBe('no-referrer');
	expect(res.headers()['cache-control']).toBe('no-store');
	expect(res.headers()['content-security-policy']).toContain("default-src 'self'");
});

test('version history: preview and restore an earlier version for everyone', async ({ browser, page }) => {
	const t = await newTree(page);
	// history is for edit links only
	expect((await page.request.get(`/api/trees/${t.viewToken}/history`)).status()).toBe(404);
	expect((await page.request.post(`/api/trees/${t.viewToken}/history`)).status()).toBe(404);

	const a = await open(browser, '/e/' + t.editToken, 'Ann');
	const b = await open(browser, '/e/' + t.editToken, 'Ben');
	await card(a, 'Love').click();
	await a.keyboard.press('c');
	await a.keyboard.type('Temporary');
	await a.keyboard.press('Enter');
	await expect(card(b, 'Temporary')).toBeVisible();

	await a.getByRole('button', { name: 'Version history' }).click();
	const dlg = a.getByRole('dialog', { name: 'Version history' });
	await expect(dlg.getByRole('button', { name: /When the tree was made/ })).toBeVisible();
	await expect(dlg.getByText('1 value added since')).toBeVisible();
	await expect(dlg.getByText(/Restoring removes\s+Temporary/)).toBeVisible();
	await dlg.getByRole('button', { name: 'Restore this version' }).click();
	await dlg.getByRole('button', { name: 'Restore for everyone' }).click();
	await expect(dlg).toBeHidden();
	await expect(card(b, 'Temporary')).toHaveCount(0);
	await expect(card(a, 'Temporary')).toHaveCount(0);

	// the tree as it was before the restore was saved, and undo still works
	await a.getByRole('button', { name: 'Version history' }).click();
	await expect(dlg.getByRole('button', { name: /Saved before a restore/ })).toBeVisible();
	await dlg.getByRole('button', { name: /Saved before a restore/ }).click();
	await expect(dlg.getByText('1 value comes back')).toBeVisible();
	await dlg.getByRole('button', { name: 'Close' }).first().click();
	await a.keyboard.press('ControlOrMeta+z');
	await expect(card(b, 'Temporary')).toBeVisible();
	await a.context().close();
	await b.context().close();
});

test('connector lines meet their cards on first load and after the document view', async ({ browser, page }) => {
	const res = await page.request.post('/api/trees', {
		data: { source: 'import', tree: JSON.parse(await (await import('node:fs/promises')).readFile('tests/fixtures/sample-v2.json', 'utf8')) }
	});
	const { editToken } = await res.json();
	const a = await open(browser, '/e/' + editToken, 'Ann');
	// worst distance (in tree units) between a line's end and the left-middle of the nearest card
	const worstGap = () =>
		a.evaluate(() => {
			const world = document.querySelector<HTMLElement>('.world')!;
			const wr = world.getBoundingClientRect();
			const sc = new DOMMatrix(getComputedStyle(world).transform).a;
			const cards = [...document.querySelectorAll('.card[data-key]')].map((c) => {
				const b = c.getBoundingClientRect();
				return [(b.left - wr.left) / sc, (b.top + b.height / 2 - wr.top) / sc];
			});
			let worst = 0;
			for (const p of document.querySelectorAll('.links path')) {
				const n = p.getAttribute('d')!.match(/-?[\d.]+/g)!.map(Number);
				const [x, y] = n.slice(-2);
				worst = Math.max(worst, Math.min(...cards.map(([cx, cy]) => Math.hypot(cx - x, cy - y))));
			}
			return worst;
		});
	await expect.poll(worstGap).toBeLessThan(1);
	await a.getByRole('tab', { name: 'Document' }).click();
	await a.getByRole('tab', { name: 'Tree' }).click();
	await expect(a.locator('.links path').first()).toBeAttached();
	await a.waitForTimeout(500);
	expect(await worstGap()).toBeLessThan(1);
	await a.context().close();
});
