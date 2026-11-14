import { describe, expect, it } from 'vitest';
import { expiredSnapshots, HISTORY } from '../../src/lib/server/history.ts';
import { diffTrees } from '../../src/lib/model/diff.ts';

const H = 3600_000;
const D = 24 * H;

describe('snapshot retention', () => {
	const now = Date.UTC(2026, 10, 14, 12);
	it('keeps everything from the last two days', () => {
		const rows = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, created_at: now - i * 10 * 60_000 }));
		expect(expiredSnapshots(rows, now)).toEqual([]);
	});
	it('keeps the newest per day up to 90 days, then one per 30 days, and always the newest', () => {
		const rows: { id: number; created_at: number }[] = [];
		let id = 1;
		for (let day = 3; day < 200; day++) for (let h = 0; h < 3; h++) rows.push({ id: id++, created_at: now - day * D - h * H });
		const gone = new Set(expiredSnapshots(rows, now));
		const kept = rows.filter((r) => !gone.has(r.id));
		const daily = kept.filter((r) => now - r.created_at < HISTORY.dailyMs);
		const days = new Set(daily.map((r) => Math.floor(r.created_at / D)));
		expect(daily.length).toBe(days.size); // one per day
		expect(days.size).toBeGreaterThan(80);
		const old = kept.filter((r) => now - r.created_at >= HISTORY.dailyMs);
		expect(old.length).toBeLessThanOrEqual(5);
		expect(old.length).toBeGreaterThan(0);
		// the newest snapshot survives even when it is old
		expect(expiredSnapshots([{ id: 1, created_at: now - 400 * D }, { id: 2, created_at: now - 401 * D }], now)).toEqual([2]);
	});
	it('caps the number per tree', () => {
		const rows = Array.from({ length: HISTORY.maxPerTree + 50 }, (_, i) => ({ id: i + 1, created_at: now - i * 1000 }));
		expect(expiredSnapshots(rows, now).length).toBe(50);
	});
});

describe('diffTrees', () => {
	const n = (title: string, children: string[] = [], notes: Record<string, string> = {}) => ({ title, meaning: '', practice: '', avoid: '', children, notes });
	it('finds values that come back, are gone and changed', () => {
		const older = { a: n('A', ['b']), b: n('B'), c: n('C') };
		const now = { a: n('A', ['b', 'd']), b: n('B', [], { a: 'x' }), d: n('D') };
		expect(diffTrees(older, now)).toEqual({ back: ['c'], gone: ['d'], changed: ['a', 'b'] });
		expect(diffTrees(older, older)).toEqual({ back: [], gone: [], changed: [] });
	});
});
