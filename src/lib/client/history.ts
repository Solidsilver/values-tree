import type { PlainTree } from '$lib/model/types.ts';

export interface Version {
	id: number;
	at: number;
	kind: 'auto' | 'created' | 'restore';
	title: string;
	values: number;
}
export interface VersionDetail extends Version {
	tree: PlainTree;
}

const base = (token: string) => `/api/trees/${encodeURIComponent(token)}/history`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch {
		throw new Error('Can’t reach the server. Version history needs a connection.');
	}
	if (!res.ok) {
		let msg = 'The server couldn’t load version history. Try again in a moment.';
		try {
			const j = await res.json();
			if (j?.message) msg = j.message;
		} catch {}
		throw new Error(msg);
	}
	return (await res.json()) as T;
}

export async function fetchVersions(token: string): Promise<Version[]> {
	return (await call<{ versions: Version[] }>(base(token))).versions;
}

export function fetchVersion(token: string, id: number): Promise<VersionDetail> {
	return call<VersionDetail>(`${base(token)}/${id}`);
}

/** Ask the server to save the tree as it is now (before a restore replaces it). */
export async function saveCheckpoint(token: string): Promise<void> {
	await call(base(token), { method: 'POST' });
}
