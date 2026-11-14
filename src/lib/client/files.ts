/** Save text as a real file download. */
export function download(filename: string, text: string, type: string) {
	const blob = new Blob([text], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export function readFile(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result || ''));
		r.onerror = () => reject(r.error);
		r.readAsText(file);
	});
}

/** Create a tree on the server. */
export async function createTreeRequest(body: { source: 'blank' | 'example' | 'import'; tree?: unknown }) {
	const res = await fetch('/api/trees', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		let msg = 'The server couldn’t create the tree. Try again in a moment.';
		try {
			const j = await res.json();
			if (j?.message) msg = j.message;
		} catch {}
		throw new Error(msg);
	}
	return (await res.json()) as { editToken: string; viewToken: string; title: string };
}
