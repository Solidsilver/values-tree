/** Trees this browser has opened. Lives only on this device; the link is the real key. */
export interface Recent {
	treeId: string;
	token: string;
	role: 'edit' | 'view';
	title: string;
	lastOpened: number;
	/** set on creation until the person confirms they saved the edit link */
	unsaved?: boolean;
}

const KEY = 'vt:recents';

export function listRecents(): Recent[] {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((r) => r && typeof r.treeId === 'string' && typeof r.token === 'string')
			.sort((a, b) => b.lastOpened - a.lastOpened);
	} catch {
		return [];
	}
}

function save(list: Recent[]) {
	try {
		localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
	} catch {}
}

/** Record a visit. An edit link for a tree replaces a view link for the same tree. */
export function remember(r: Omit<Recent, 'lastOpened'> & { lastOpened?: number }) {
	const list = listRecents();
	const existing = list.find((x) => x.treeId === r.treeId);
	const keepEdit = existing && existing.role === 'edit' && r.role === 'view' && existing.token !== r.token;
	const next: Recent = keepEdit
		? { ...existing, title: r.title || existing.title, lastOpened: Date.now() }
		: { ...existing, ...r, lastOpened: r.lastOpened ?? Date.now() };
	save([next, ...list.filter((x) => x.treeId !== r.treeId)]);
}

export function updateRecent(treeId: string, patch: Partial<Recent>) {
	const list = listRecents();
	const i = list.findIndex((x) => x.treeId === treeId);
	if (i < 0) return;
	list[i] = { ...list[i], ...patch };
	save(list);
}

export function forget(treeId: string) {
	save(listRecents().filter((x) => x.treeId !== treeId));
}

export function linkFor(r: Pick<Recent, 'role' | 'token'>, origin = location.origin) {
	return `${origin}/${r.role === 'edit' ? 'e' : 'v'}/${r.token}`;
}
