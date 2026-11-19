import type * as Y from 'yjs';
import { LOCAL_ORIGIN } from '$lib/model/schema.ts';

export interface BindTextParams {
	text: Y.Text | undefined;
	readonly?: boolean;
	/** grow a textarea with its content */
	autosize?: boolean;
}

/** Smallest single edit that turns `a` into `b`: common prefix and suffix are kept. */
export function diff(a: string, b: string): { index: number; remove: number; insert: string } | null {
	if (a === b) return null;
	let start = 0;
	const max = Math.min(a.length, b.length);
	while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
		endA--;
		endB--;
	}
	return { index: start, remove: endA - start, insert: b.slice(start, endB) };
}

/** Move a caret position through a Y.Text change. Text inserted exactly at the caret goes after it. */
export function transformPos(pos: number, delta: { retain?: number; insert?: string | object; delete?: number }[]) {
	let i = 0;
	let out = pos;
	for (const op of delta) {
		if (op.retain != null) i += op.retain;
		else if (op.insert != null) {
			const len = typeof op.insert === 'string' ? op.insert.length : 1;
			if (i < out) out += len;
			i += len;
		} else if (op.delete != null) {
			if (i < out) out -= Math.min(op.delete, out - i);
		}
	}
	return out;
}

function grow(el: HTMLInputElement | HTMLTextAreaElement) {
	if (!(el instanceof HTMLTextAreaElement)) return;
	el.style.height = 'auto';
	el.style.height = el.scrollHeight + 2 + 'px';
}

/**
 * Two-way binding between an <input>/<textarea> and a Y.Text.
 * Local typing becomes minimal Y.Text edits (so concurrent typing merges); remote edits update
 * the field and keep the caret where it was relative to the text. Nothing is applied mid-IME
 * composition; the field catches up when composition ends.
 */
export function bindText(el: HTMLInputElement | HTMLTextAreaElement, params: BindTextParams) {
	let text = params.text;
	let composing = false;
	let applying = false;
	let opts = params;

	const render = () => {
		const v = text?.toString() ?? '';
		if (el.value !== v) el.value = v;
		if (opts.autosize) grow(el);
	};

	const push = () => {
		if (!text || opts.readonly) return;
		const d = diff(text.toString(), el.value);
		if (!d) return;
		applying = true;
		try {
			text.doc!.transact(() => {
				if (d.remove) text!.delete(d.index, d.remove);
				if (d.insert) text!.insert(d.index, d.insert);
			}, LOCAL_ORIGIN);
		} finally {
			applying = false;
		}
	};

	const onInput = () => {
		if (opts.autosize) grow(el);
		if (!composing) push();
	};
	const onCompStart = () => (composing = true);
	const onCompEnd = () => {
		composing = false;
		push();
		render();
	};

	const observer = (e: Y.YTextEvent) => {
		if (applying || composing) return;
		const focused = document.activeElement === el;
		const start = el.selectionStart ?? 0;
		const end = el.selectionEnd ?? 0;
		const dir = el.selectionDirection ?? 'none';
		const delta = e.delta as { retain?: number; insert?: string; delete?: number }[];
		render();
		if (focused) {
			const s = transformPos(start, delta);
			const t = start === end ? s : transformPos(end, delta);
			try {
				el.setSelectionRange(s, t, dir);
			} catch {}
		}
	};

	const attach = () => {
		text?.observe(observer);
		render();
	};
	const detach = () => text?.unobserve(observer);

	el.addEventListener('input', onInput);
	el.addEventListener('compositionstart', onCompStart);
	el.addEventListener('compositionend', onCompEnd);
	el.readOnly = !!opts.readonly;
	if (opts.autosize) el.dataset.autosize = 'true';
	attach();
	if (opts.autosize) requestAnimationFrame(() => grow(el));

	return {
		update(next: BindTextParams) {
			opts = next;
			el.readOnly = !!next.readonly;
			if (next.text !== text) {
				detach();
				text = next.text;
				attach();
			}
		},
		destroy() {
			detach();
			el.removeEventListener('input', onInput);
			el.removeEventListener('compositionstart', onCompStart);
			el.removeEventListener('compositionend', onCompEnd);
		}
	};
}
