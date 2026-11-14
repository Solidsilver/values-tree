<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { bindText } from '$lib/client/bindText.ts';
	import { alsoText, countBelow, noLoop, noteOf, titleOf } from '$lib/model/derive.ts';
	import Icon from './Icon.svelte';

	let {
		id,
		key,
		parentId,
		depth,
		rootIdx,
		posinset,
		setsize
	}: { id: string; key: string; parentId: string | null; depth: number; rootIdx: number; posinset: number; setsize: number } =
		$props();

	const ed = useEditor();
	const s = ed.s;

	const v = $derived(s.view);
	const n = $derived(v.nodes[id]);
	const others = $derived((v.parentsOf.get(id) || []).filter((x) => x !== parentId));
	const hasKids = $derived(n.children.length > 0);
	const folded = $derived(hasKids && s.collapsed.has(id));
	const isSel = $derived(s.selectedKey === key);
	const isAlso = $derived(!isSel && s.selected?.id === id);
	const note = $derived(parentId ? noteOf(v, id, parentId) : '');
	const inline = $derived(ed.inlineKey === key && ed.canEdit);
	const peers = $derived(s.peers.filter((p) => !p.self && p.selected === id));
	const firstSpot = $derived(v.firstKey.get(id) === key);
	const tabbable = $derived(s.selectedKey ? isSel : depth === 0 && posinset === 1);
	const label = $derived(
		titleOf(v, id) +
			(depth === 0 ? ', root value' : '') +
			(others.length ? ', ' + alsoText(v, others) : '') +
			(folded ? ', ' + countBelow(v, id) + ' values hidden' : '')
	);

	let dropState = $state<'' | 'move' | 'link'>('');

	function onclick(e: MouseEvent) {
		e.stopPropagation();
		if (inline) return;
		ed.select(key, true);
	}
	function ondblclick(e: MouseEvent) {
		e.stopPropagation();
		if (!ed.canEdit) return;
		ed.select(key);
		ed.inlineKey = key;
	}
	function onkeydown(e: KeyboardEvent) {
		if (inline || e.target !== e.currentTarget) return;
		if (e.ctrlKey || e.metaKey) return;
		const k = e.key;
		if (s.selectedKey !== key) s.select(key);
		if (k === 'Enter' || k === 'F2') {
			e.preventDefault();
			if (ed.canEdit) ed.inlineKey = key;
			else ed.sheetOpen = true;
		} else if (k === 'Escape') {
			e.preventDefault();
			ed.select(null);
		} else if (!ed.canEdit && !k.startsWith('Arrow')) {
			return;
		} else if ((k === 'c' || k === 'C') && !e.altKey) {
			e.preventDefault();
			ed.addChild(key);
		} else if ((k === 'n' || k === 'N') && !e.altKey) {
			e.preventDefault();
			ed.addSibling(key);
		} else if (k === 'Delete' || k === 'Backspace') {
			e.preventDefault();
			ed.askDelete(key);
		} else if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
			e.preventDefault();
			ed.moveSibling(k === 'ArrowUp' ? -1 : 1, key);
		} else if (k.startsWith('Arrow')) {
			e.preventDefault();
			ed.navigate(k);
		}
	}

	function finishInline(el: HTMLInputElement, refocus: boolean) {
		if (ed.inlineKey !== key) return;
		ed.inlineKey = null;
		if (refocus) ed.focusCard(key);
		void el;
	}

	function focusInline(el: HTMLInputElement) {
		// focus at once, so keys typed straight after C or N land in the title
		el.focus({ preventScroll: true });
		el.select();
	}

	/* drag and drop: drop on a card to move under it, Alt/Option to also link */
	function ondragstart(e: DragEvent) {
		if (!ed.canEdit || inline) {
			e.preventDefault();
			return;
		}
		ed.dragKey = key;
		e.dataTransfer!.effectAllowed = 'linkMove';
		try {
			e.dataTransfer!.setData('text/plain', titleOf(v, id));
		} catch {}
	}
	function ondragend() {
		ed.dragKey = null;
		dropState = '';
	}
	function canDrop() {
		const src = ed.dragKey && v.placements.get(ed.dragKey);
		return !!src && src.id !== id && noLoop(v, src.id, id);
	}
	function ondragover(e: DragEvent) {
		if (!canDrop()) return;
		e.preventDefault();
		const linking = e.altKey;
		e.dataTransfer!.dropEffect = linking ? 'link' : 'move';
		dropState = linking ? 'link' : 'move';
	}
	function ondragleave(e: DragEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) dropState = '';
	}
	function ondrop(e: DragEvent) {
		const from = ed.dragKey;
		dropState = '';
		if (!from || !canDrop()) return;
		e.preventDefault();
		ed.dragKey = null;
		const src = v.placements.get(from)!;
		if (e.altKey) ed.link(src.id, id);
		else ed.moveTo(from, id);
	}
</script>

<div class="node-wrap" data-node-key={key}>
	<div
		class="card"
		class:root={depth === 0}
		class:selected={isSel}
		class:also-selected={isAlso}
		class:shared={others.length > 0}
		class:drop-move={dropState === 'move'}
		class:drop-link={dropState === 'link'}
		class:dragging={ed.dragKey === key}
		class:has-peers={peers.length > 0}
		style:--peer={peers[0]?.color}
		role="treeitem"
		tabindex={tabbable ? 0 : -1}
		aria-level={depth + 1}
		aria-posinset={posinset}
		aria-setsize={setsize}
		aria-selected={isSel}
		aria-expanded={hasKids ? !folded : undefined}
		aria-label={label}
		data-key={key}
		data-id={id}
		data-root={rootIdx % 5}
		draggable={ed.canEdit && !inline}
		{onclick}
		{ondblclick}
		{onkeydown}
		{ondragstart}
		{ondragend}
		{ondragover}
		{ondragleave}
		{ondrop}
	>
		{#if inline}
			<input
				class="inline-title"
				aria-label="Value title"
				placeholder="Name this value"
				use:bindText={{ text: ed.text(id, 'title') }}
				use:focusInline
				onkeydown={(e) => {
					e.stopPropagation();
					if (e.key === 'Enter' || e.key === 'Escape') {
						e.preventDefault();
						finishInline(e.currentTarget, true);
					}
				}}
				onblur={(e) => finishInline(e.currentTarget, false)}
				onclick={(e) => e.stopPropagation()}
				ondblclick={(e) => e.stopPropagation()}
			/>
		{:else}
			<span class="title" class:placeholder={!n.title}>{titleOf(v, id)}</span>
		{/if}
		{#if n.meaning}<span class="meaning">{n.meaning}</span>{/if}
		{#if note}<span class="via" title="How {titleOf(v, parentId)} shapes this">{note}</span>{/if}
		{#if n.practice || n.avoid}
			<span class="marks">
				{#if n.practice}<span>How we live it</span>{/if}
				{#if n.avoid}<span class="avoid">Not this</span>{/if}
			</span>
		{/if}
		{#if others.length}
			<span class="also"><Icon name="branch" size={13} stroke={2} />{alsoText(v, others)}</span>
		{/if}
		{#if peers.length && firstSpot}
			<span class="peer-tags" aria-hidden="true">
				{#each peers as p (p.clientId)}<span class="peer-tag" style:background={p.color}>{p.name}</span>{/each}
			</span>
		{/if}
	</div>
	{#if hasKids}
		<button
			type="button"
			class="fold"
			aria-expanded={!folded}
			aria-label={folded ? `Show the ${countBelow(v, id)} values under ${titleOf(v, id)}` : `Hide the values under ${titleOf(v, id)}`}
			title={folded ? `Show the ${countBelow(v, id)} values under this` : 'Hide the values under this'}
			tabindex="-1"
			onclick={(e) => {
				e.stopPropagation();
				s.toggleFold(id);
			}}
		>
			{#if folded}+{countBelow(v, id)}{:else}<Icon name="minus" size={12} stroke={2.4} />{/if}
		</button>
	{/if}
	{#if ed.canEdit}
		<button
			type="button"
			class="add-child"
			tabindex="-1"
			aria-label="Add a value under {titleOf(v, id)}"
			title="Add a value that grows from this one (C)"
			onclick={(e) => {
				e.stopPropagation();
				ed.addChild(key);
			}}><Icon name="plus" size={14} stroke={2.2} /></button
		>
	{/if}
</div>

<style>
	.node-wrap {
		position: relative;
		flex: none;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: 232px;
		padding: 10px 14px 11px 15px;
		background: var(--surface);
		border: 1px solid color-mix(in srgb, var(--hue) 22%, var(--line));
		border-radius: var(--r);
		box-shadow: var(--shadow);
		cursor: default;
		user-select: none;
		-webkit-user-select: none;
		outline: none;
		transition:
			box-shadow 0.16s var(--ease),
			transform 0.16s var(--ease),
			border-color 0.16s;
	}
	/* the hue rule: a short ink stroke on the left says which root this belongs to */
	.card::before {
		content: '';
		position: absolute;
		left: -1px;
		top: 10px;
		bottom: 10px;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--hue);
		opacity: 0.85;
	}
	.card:hover {
		box-shadow: var(--shadow-lift);
	}
	.card.root {
		width: 268px;
		padding: 14px 16px 15px 19px;
		background: color-mix(in srgb, var(--hue) 9%, var(--surface));
		border-color: color-mix(in srgb, var(--hue) 45%, var(--line));
		border-width: 1.5px;
	}
	.card.root::before {
		top: 0;
		bottom: 0;
		width: 6px;
		left: -1.5px;
		border-radius: var(--r) 0 0 var(--r);
		opacity: 1;
	}
	.title {
		font-family: var(--font-display);
		font-variation-settings: 'opsz' 24;
		font-weight: 560;
		font-size: 16.5px;
		line-height: 1.25;
		overflow-wrap: anywhere;
	}
	.root .title {
		font-size: 22px;
		font-weight: 600;
		font-variation-settings: 'opsz' 60;
		letter-spacing: -0.01em;
	}
	.title.placeholder {
		color: var(--muted);
		font-style: italic;
		font-weight: 400;
	}
	.inline-title {
		font-family: var(--font-display);
		font-weight: 560;
		font-size: 16.5px;
		line-height: 1.25;
		width: 100%;
		border: 0;
		border-bottom: 1.5px solid var(--accent);
		background: transparent;
		padding: 0 0 2px;
		margin: 0;
		outline: none;
		user-select: text;
		-webkit-user-select: text;
	}
	.root .inline-title {
		font-size: 22px;
	}
	.meaning {
		font-size: var(--t-sm);
		color: var(--ink-2);
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.via {
		font-family: var(--font-display);
		font-style: italic;
		font-size: 13.5px;
		color: var(--ink-2);
		border-left: 2px solid color-mix(in srgb, var(--hue) 50%, var(--line));
		padding-left: 8px;
		margin: 2px 0;
		overflow-wrap: anywhere;
	}
	.marks {
		display: flex;
		gap: 10px;
		font-size: var(--t-xs);
		color: var(--muted);
	}
	.marks span::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--hue);
		margin-right: 5px;
		vertical-align: 1px;
	}
	.marks .avoid::before {
		background: transparent;
		border: 1.5px solid var(--danger);
		width: 5px;
		height: 5px;
	}
	.also {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		align-self: flex-start;
		margin-top: 4px;
		font-size: var(--t-xs);
		font-weight: 520;
		color: var(--ink-2);
		background: color-mix(in srgb, var(--hue) 11%, var(--paper));
		border-radius: 999px;
		padding: 2px 9px 2px 7px;
	}
	.card.shared {
		border-style: dashed;
	}
	.card.selected {
		border-color: var(--accent);
		box-shadow:
			0 0 0 2px var(--accent),
			var(--shadow-lift);
	}
	.card.also-selected {
		box-shadow:
			0 0 0 2px var(--paper),
			0 0 0 3.5px color-mix(in srgb, var(--accent) 55%, transparent);
	}
	.card:focus-visible {
		box-shadow:
			0 0 0 2px var(--paper),
			0 0 0 4px var(--focus),
			var(--shadow-lift);
	}
	.card.has-peers:not(.selected) {
		box-shadow:
			0 0 0 2px var(--peer),
			var(--shadow);
	}
	.card.has-peers.selected {
		box-shadow:
			0 0 0 2px var(--accent),
			0 0 0 5px var(--peer);
	}
	.peer-tags {
		position: absolute;
		top: -11px;
		right: 10px;
		display: flex;
		gap: 4px;
	}
	.peer-tag {
		font-size: 11px;
		font-weight: 600;
		line-height: 1;
		color: #fff;
		padding: 4px 7px;
		border-radius: 999px;
		max-width: 110px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.card.drop-move {
		transform: scale(1.025);
		box-shadow:
			0 0 0 2px var(--hue),
			var(--shadow-lift);
	}
	.card.drop-link {
		transform: scale(1.025);
		background: var(--accent-soft);
		box-shadow:
			0 0 0 2px var(--accent),
			var(--shadow-lift);
	}
	.card.dragging {
		opacity: 0.5;
	}
	.fold {
		position: absolute;
		right: -13px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 2;
		min-width: 26px;
		height: 26px;
		padding: 0 7px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		border: 1.5px solid color-mix(in srgb, var(--hue) 55%, var(--line));
		background: var(--surface);
		font-size: 12px;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.fold:hover {
		background: color-mix(in srgb, var(--hue) 14%, var(--surface));
	}
	.add-child {
		position: absolute;
		left: 50%;
		bottom: -12px;
		transform: translateX(-50%);
		z-index: 2;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 50%;
		border: 0;
		background: var(--accent);
		color: var(--accent-ink);
		opacity: 0;
		transition: opacity 0.12s;
	}
	.node-wrap:hover .add-child,
	.card.selected ~ .add-child {
		opacity: 1;
	}
	@media (pointer: coarse) {
		.card.selected ~ .add-child {
			width: 36px;
			height: 36px;
			bottom: -18px;
		}
		.fold {
			min-width: 34px;
			height: 34px;
			right: -17px;
		}
	}
</style>
