import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { diff, transformPos } from '../../src/lib/client/bindText.ts';

describe('bindText helpers', () => {
	it('diffs to a minimal single edit', () => {
		expect(diff('hello world', 'hello brave world')).toEqual({ index: 6, remove: 0, insert: 'brave ' });
		expect(diff('hello world', 'hello')).toEqual({ index: 5, remove: 6, insert: '' });
		expect(diff('aaa', 'aaaa')).toEqual({ index: 3, remove: 0, insert: 'a' });
		expect(diff('same', 'same')).toBeNull();
	});
	it('keeps the caret in place across remote edits', () => {
		const doc = new Y.Doc();
		const t = doc.getText('t');
		t.insert(0, 'hello world');
		let delta: any[] = [];
		t.observe((e) => (delta = e.delta as any[]));
		t.insert(0, '>> '); // before the caret at 8 ("hello wo|rld")
		expect(transformPos(8, delta)).toBe(11);
		t.insert(14, '!!'); // after the caret
		expect(transformPos(11, delta)).toBe(11);
		t.delete(0, 3); // delete before
		expect(transformPos(11, delta)).toBe(8);
		t.delete(6, 4); // delete spanning caret at 8
		expect(transformPos(8, delta)).toBe(6);
	});
});
