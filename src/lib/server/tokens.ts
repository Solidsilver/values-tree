import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** 16 random bytes, base64url (22 chars). Only the SHA-256 hash is stored. */
export function newToken(): string {
	return randomBytes(16).toString('base64url');
}

/** Public tree ids: 9 random bytes, base64url (12 chars). */
export function newTreeId(): string {
	return randomBytes(9).toString('base64url');
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Shape check before touching the database. */
export function isTokenShape(token: unknown): token is string {
	return typeof token === 'string' && /^[A-Za-z0-9_-]{22}$/.test(token);
}

export function sameHash(a: string, b: string): boolean {
	const x = Buffer.from(a, 'hex');
	const y = Buffer.from(b, 'hex');
	return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * The view token, encrypted with a key derived from the edit token. Lets edit-link holders see
 * the view link again later while the database holds no usable secret on its own.
 */
function sealKey(editToken: string): Buffer {
	return Buffer.from(hkdfSync('sha256', editToken, 'values-tree', 'view-link-seal', 32));
}
export function sealView(editToken: string, viewToken: string): string {
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', sealKey(editToken), iv);
	const body = Buffer.concat([c.update(viewToken, 'utf8'), c.final()]);
	return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
export function unsealView(editToken: string, sealed: string): string | null {
	try {
		const raw = Buffer.from(sealed, 'base64url');
		const d = createDecipheriv('aes-256-gcm', sealKey(editToken), raw.subarray(0, 12));
		d.setAuthTag(raw.subarray(12, 28));
		return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
	} catch {
		return null;
	}
}
