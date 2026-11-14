/** Compare two versions of a tree by value id, for the history preview. Pure. */

type Comparable = Record<
	string,
	{ title: string; meaning: string; practice: string; avoid: string; children: string[]; notes?: Record<string, string> }
>;

export interface TreeDiff {
	/** in the older version but not in the current tree: restoring brings these back */
	back: string[];
	/** in the current tree but not in the older version: restoring removes these */
	gone: string[];
	/** in both, but with different words, children or notes */
	changed: string[];
}

const notesKey = (n?: Record<string, string>) =>
	Object.keys(n || {})
		.filter((k) => n![k])
		.sort()
		.map((k) => k + '=' + n![k])
		.join('\u0000');

export function diffTrees(older: Comparable, current: Comparable): TreeDiff {
	const back: string[] = [];
	const changed: string[] = [];
	for (const id of Object.keys(older)) {
		const a = older[id];
		const b = current[id];
		if (!b) back.push(id);
		else if (
			a.title !== b.title ||
			a.meaning !== b.meaning ||
			a.practice !== b.practice ||
			a.avoid !== b.avoid ||
			a.children.join(',') !== b.children.join(',') ||
			notesKey(a.notes) !== notesKey(b.notes)
		)
			changed.push(id);
	}
	const gone = Object.keys(current).filter((id) => !older[id]);
	return { back, gone, changed };
}
