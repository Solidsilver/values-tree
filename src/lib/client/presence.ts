/** Display name and colour for presence, stored on this device. */
export interface Identity {
	name: string;
	color: string;
	/** has the person chosen a name (or skipped the prompt)? */
	chosen: boolean;
}

/** Presence colours: distinct from the five root hues, readable as rings in both themes. */
export const PRESENCE_COLORS = ['#c2410c', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f', '#b45309', '#1d4ed8', '#9f1239'];

export function colorFor(seed: string): string {
	let h = 0;
	for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
	return PRESENCE_COLORS[Math.abs(h) % PRESENCE_COLORS.length];
}

const KEY = 'vt:identity';

export function loadIdentity(): Identity {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
		if (raw && typeof raw.name === 'string' && typeof raw.color === 'string')
			return { name: raw.name, color: raw.color, chosen: !!raw.chosen };
	} catch {}
	const seed = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
	return { name: 'Guest', color: colorFor(seed), chosen: false };
}

export function saveIdentity(id: Identity) {
	try {
		localStorage.setItem(KEY, JSON.stringify(id));
	} catch {}
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
