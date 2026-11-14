/** Ids for values: 'v' + 11 base36 chars. Works in Node and the browser. */
export function uid(): string {
	const bytes = new Uint8Array(8);
	globalThis.crypto.getRandomValues(bytes);
	let s = '';
	for (const b of bytes) s += (b % 36).toString(36);
	return 'v' + s + Date.now().toString(36).slice(-3);
}

/** Ids are used inside placement keys joined by '/', so slashes are not allowed. */
export function sanitizeId(s: unknown): string {
	return str(s).replace(/\//g, '-');
}

export function str(v: unknown): string {
	return typeof v === 'string' ? v : v == null ? '' : String(v);
}
