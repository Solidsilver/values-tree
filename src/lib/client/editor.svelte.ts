import { getContext, setContext, tick } from 'svelte';
import * as ops from '$lib/model/ops.ts';
import { nodesOf, textOf, metaOf } from '$lib/model/schema.ts';
import type { OpResult } from '$lib/model/ops.ts';
import type { PlainTree } from '$lib/model/types.ts';
import { toast } from './toast.svelte.ts';
import type { Session } from './session.svelte.ts';

export type Mode = 'tree' | 'doc';

/**
 * UI-level controller for one open tree: wraps model ops with selection, focus and messages,
 * and holds which view and dialogs are open.
 */
export class Editor {
	readonly s: Session;
	mode = $state<Mode>('tree');
	/** placement key whose title is being edited in place on its card */
	inlineKey = $state<string | null>(null);
	deleteKey = $state<string | null>(null);
	shareOpen = $state(false);
	exportOpen = $state(false);
	importOpen = $state(false);
	historyOpen = $state(false);
	findOpen = $state(false);
	nameOpen = $state(false);
	/** mobile: is the details sheet open? */
	sheetOpen = $state(false);
	/** placement key of the card being dragged */
	dragKey = $state<string | null>(null);
	/** registered by the canvas */
	reveal: (key: string, smooth?: boolean) => void = () => {};

	constructor(session: Session) {
		this.s = session;
	}

	get canEdit() {
		return this.s.role === 'edit' && this.s.conn !== 'revoked' && this.s.conn !== 'unknown';
	}

	text(id: string | null, field: 'title' | 'meaning' | 'practice' | 'avoid') {
		if (!id) return undefined;
		return textOf(nodesOf(this.s.doc).get(id), field);
	}
	metaText(field: 'title' | 'intro') {
		return textOf(metaOf(this.s.doc), field);
	}

	private run(fn: () => OpResult): OpResult | null {
		if (!this.canEdit) return null;
		// every structural change is its own undo step (typing still groups by pauses)
		this.s.undoManager.stopCapturing();
		const r = this.s.after(fn());
		this.s.undoManager.stopCapturing();
		if (r.error) toast.show(r.error);
		else if (r.message) toast.show(r.message);
		return r;
	}

	/** Replace the whole tree (import or restore) as one undoable step. */
	replaceAll(tree: PlainTree, message: string): boolean {
		return !!this.run(() => {
			ops.replaceTree(this.s.doc, tree);
			return { selectKey: null, message };
		});
	}

	async focusCard(key: string | null, opts: { smooth?: boolean } = {}) {
		if (!key) return;
		await tick();
		if (this.mode !== 'tree') return;
		const el = document.querySelector<HTMLElement>(`.card[data-key="${CSS.escape(key)}"]`);
		this.reveal(key, opts.smooth ?? true);
		el?.focus({ preventScroll: true });
	}

	select(key: string | null, focus = false) {
		this.s.select(key);
		if (key) this.sheetOpen = true;
		if (focus) this.focusCard(key);
	}

	/** After adding a value, put the cursor in its title on the card. */
	private async editNew(r: OpResult | null) {
		if (!r?.selectKey) return;
		this.sheetOpen = true;
		if (this.mode === 'tree') {
			this.inlineKey = r.selectKey;
			await tick();
			this.reveal(r.selectKey, true);
		} else {
			await tick();
			document.querySelector<HTMLInputElement>('#f-title')?.focus();
		}
	}

	addRoot() {
		this.editNew(this.run(() => ops.addRoot(this.s.doc, this.s.view)));
	}
	addChild(key: string | null = this.s.selectedKey) {
		if (!key) return;
		this.editNew(this.run(() => ops.addChild(this.s.doc, this.s.view, key)));
	}
	addSibling(key: string | null = this.s.selectedKey) {
		if (!key) return;
		this.editNew(this.run(() => ops.addSibling(this.s.doc, this.s.view, key)));
	}
	moveSibling(dir: -1 | 1, key = this.s.selectedKey) {
		if (!key) return;
		this.run(() => ops.moveSibling(this.s.doc, this.s.view, key, dir));
		this.focusCard(this.s.selectedKey);
	}
	moveOut(key = this.s.selectedKey) {
		if (!key) return;
		this.run(() => ops.moveOut(this.s.doc, this.s.view, key));
		this.focusCard(this.s.selectedKey);
	}
	moveIn(key = this.s.selectedKey) {
		if (!key) return;
		this.run(() => ops.moveIn(this.s.doc, this.s.view, key));
		this.focusCard(this.s.selectedKey);
	}
	moveTo(key: string, target: string | null) {
		const r = this.run(() => ops.moveTo(this.s.doc, this.s.view, key, target));
		if (r && !r.error) this.focusCard(this.s.selectedKey);
	}
	link(id: string, target: string) {
		this.run(() => ops.link(this.s.doc, this.s.view, id, target));
	}
	rerank(id: string, parent: string, dir: -1 | 1) {
		this.run(() => ops.rerank(this.s.doc, this.s.view, id, parent, dir));
	}
	unlink(id: string, parent: string) {
		this.run(() => ops.unlink(this.s.doc, this.s.view, id, parent, this.s.selectedKey));
	}
	remove(key: string, keepChildren: boolean) {
		this.run(() => ops.removeNode(this.s.doc, this.s.view, key, keepChildren));
		this.focusCard(this.s.selectedKey);
	}
	setNote(id: string, parent: string, text: string) {
		if (!this.canEdit) return;
		ops.setNote(this.s.doc, id, parent, text);
	}
	askDelete(key = this.s.selectedKey) {
		if (key && this.canEdit) this.deleteKey = key;
	}
	undo() {
		this.s.undo();
	}
	redo() {
		this.s.redo();
	}

	/** Arrow-key movement between cards, as in the original. */
	navigate(k: string) {
		const pl = this.s.selected;
		if (!pl) return;
		const v = this.s.view;
		let t: string | null = null;
		if (k === 'ArrowLeft') t = pl.parentKey;
		else if (k === 'ArrowRight' && v.nodes[pl.id].children.length) {
			if (this.s.collapsed.has(pl.id)) this.s.toggleFold(pl.id, true);
			t = pl.key + '/' + v.nodes[pl.id].children[0];
		} else if (k === 'ArrowUp' && pl.i > 0) t = this.s.keyFor(pl.list[pl.i - 1], pl.parentKey);
		else if (k === 'ArrowDown' && pl.i < pl.list.length - 1) t = this.s.keyFor(pl.list[pl.i + 1], pl.parentKey);
		if (t) this.select(t, true);
	}
}

const KEY = Symbol('editor');
export const setEditor = (e: Editor) => setContext(KEY, e);
export const useEditor = () => getContext<Editor>(KEY);
