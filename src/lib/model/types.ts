/** Plain (non-Yjs) shapes shared by derive, ops and io. */

export interface PlainNode {
	id: string;
	title: string;
	meaning: string;
	practice: string;
	avoid: string;
	/** parentId -> how that parent shapes this value */
	notes: Record<string, string>;
	/** parent ids in precedence order (may be partial or stale) */
	rank: string[];
	collapsed: boolean;
	children: string[];
}

export interface PlainTree {
	title: string;
	intro: string;
	roots: string[];
	nodes: Record<string, PlainNode>;
}

/** One spot where a value appears in the drawn tree (a path from a root). */
export interface Placement {
	key: string;
	id: string;
	parentId: string | null;
	parentKey: string | null;
	/** the sibling list this placement sits in (roots, or the parent's children) */
	list: string[];
	i: number;
	depth: number;
	rootIdx: number;
}

export interface ViewNode {
	id: string;
	title: string;
	meaning: string;
	practice: string;
	avoid: string;
	notes: Record<string, string>;
	children: string[];
}

export interface TreeStats {
	roots: number;
	total: number;
	deepest: number;
	shared: number;
}

export interface TreeView {
	title: string;
	intro: string;
	roots: string[];
	nodes: Record<string, ViewNode>;
	/** parents of each value, in precedence order (first wins) */
	parentsOf: Map<string, string[]>;
	placements: Map<string, Placement>;
	firstKey: Map<string, string>;
	stats: TreeStats;
}
