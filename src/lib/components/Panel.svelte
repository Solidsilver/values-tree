<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { bindText } from '$lib/client/bindText.ts';
	import { ancestorsOf, kindOf, noLoop, noteOf, outline, titleOf } from '$lib/model/derive.ts';
	import { canMoveIn, canMoveOut } from '$lib/model/ops.ts';
	import Icon from './Icon.svelte';
	import NoteInput from './NoteInput.svelte';
	import Shortcuts from './Shortcuts.svelte';

	const ed = useEditor();
	const s = ed.s;
	const v = $derived(s.view);
	const pl = $derived(s.selected);
	const id = $derived(pl?.id ?? null);
	const n = $derived(id ? v.nodes[id] : null);
	const parents = $derived(id ? v.parentsOf.get(id) || [] : []);
	const ro = $derived(!ed.canEdit);

	const crumbs = $derived.by(() => {
		const out: { key: string; id: string }[] = [];
		for (let k = pl?.parentKey ?? null; k; k = v.placements.get(k)?.parentKey ?? null) {
			const p = v.placements.get(k);
			if (!p) break;
			out.unshift({ key: p.key, id: p.id });
		}
		return out;
	});
	const ancestors = $derived(id ? ancestorsOf(v, id) : []);
	const all = $derived(outline(v));
	const linkable = $derived(id ? all.filter((o) => !parents.includes(o.id) && noLoop(v, id, o.id)) : []);
	const movable = $derived(id && pl ? all.filter((o) => o.id !== pl.parentId && noLoop(v, id, o.id)) : []);

	// ephemeral ticks for "Everything that shapes this" (never saved)
	let ticks = $state<Record<string, boolean>>({});
	$effect(() => {
		void id;
		ticks = {};
	});

	const pad = (d: number) => ' '.repeat(d);

	function onTitleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.preventDefault();
			if (pl && ed.mode === 'tree') ed.focusCard(pl.key);
		}
	}
</script>

{#if pl && n && id}
	<div class="panel-body" style:--hue="var(--b{(pl.rootIdx % 5) + 1})">
		<div class="where">
			{#if crumbs.length}
				<nav class="lineage" aria-label="Path to this spot">
					<span class="lead">{parents.length > 1 ? 'Here, under' : 'Grows from'}</span>
					{#each crumbs as c, i (c.key)}
						{#if i}<span class="sep" aria-hidden="true">›</span>{/if}
						<button type="button" onclick={() => ed.select(c.key, true)}>{titleOf(v, c.id)}</button>
					{/each}
				</nav>
			{:else}
				<p class="lineage"><span class="root-mark" aria-hidden="true"></span>A root value. Everything beneath it grows from it.</p>
			{/if}
			<button type="button" class="icon-btn small close" aria-label="Close details" title="Done" onclick={() => {
				const k = pl.key;
				ed.select(null);
				ed.sheetOpen = false;
				ed.focusCard(k);
			}}><Icon name="close" /></button>
		</div>

		<div class="field title-field">
			<label for="f-title" class="sr-only">Value</label>
			<input
				id="f-title"
				autocomplete="off"
				placeholder={ro ? 'Untitled value' : 'Name this value, e.g. Kindness'}
				use:bindText={{ text: ed.text(id, 'title'), readonly: ro }}
				onkeydown={onTitleKey}
			/>
			<span class="kind">
				{kindOf(v, id, pl.depth)}{pl.depth ? ` · level ${pl.depth + 1}` : ''}{parents.length > 1 ? ` · grows from ${parents.length} values` : ''}
			</span>
		</div>

		<div class="field">
			<label for="f-meaning">What it means to us</label>
			<textarea id="f-meaning" rows="2" placeholder={ro ? 'Not written yet.' : 'In a sentence or two, what does this mean in our family?'} use:bindText={{ text: ed.text(id, 'meaning'), readonly: ro, autosize: true }}></textarea>
		</div>
		<div class="field">
			<label for="f-practice">How we live it <span class="sub">habits, examples, things we say</span></label>
			<textarea id="f-practice" rows="2" placeholder={ro ? 'Not written yet.' : 'What does this look like on an ordinary Tuesday?'} use:bindText={{ text: ed.text(id, 'practice'), readonly: ro, autosize: true }}></textarea>
		</div>
		<div class="field">
			<label for="f-avoid">Not this <span class="sub">good things we pass on, and why</span></label>
			<textarea id="f-avoid" rows="2" placeholder={ro ? 'Not written yet.' : 'e.g. Resort trips where we mostly lie around and are waited on'} use:bindText={{ text: ed.text(id, 'avoid'), readonly: ro, autosize: true }}></textarea>
		</div>

		{#if !ro}
			<div class="row">
				<button type="button" class="btn primary" onclick={() => ed.addChild(pl.key)}><Icon name="plus" /> Add a value under this</button>
				<button type="button" class="btn" onclick={() => ed.addSibling(pl.key)}>Add a sibling</button>
			</div>
		{/if}

		{#if parents.length}
			<section class="group">
				<h3>Shaped by{parents.length > 1 ? ` ${parents.length} values, in order of precedence` : ''}</h3>
				<ol class="shaped">
					{#each parents as pid, i (pid)}
						<li>
							<div class="shaped-head">
								{#if parents.length > 1}<span class="rank" aria-hidden="true">{i + 1}</span>{/if}
								<button type="button" class="plink" onclick={() => ed.select(v.firstKey.get(pid) ?? null, true)}>{titleOf(v, pid)}</button>
								{#if parents.length > 1 && !ro}
									<button type="button" class="icon-btn small" disabled={i === 0} aria-label="Give {titleOf(v, pid)} more precedence" onclick={() => ed.rerank(id, pid, -1)}><Icon name="arrowUp" /></button>
									<button type="button" class="icon-btn small" disabled={i === parents.length - 1} aria-label="Give {titleOf(v, pid)} less precedence" onclick={() => ed.rerank(id, pid, 1)}><Icon name="arrowDown" /></button>
									<button type="button" class="btn quiet small" aria-label="Stop it growing from {titleOf(v, pid)}" onclick={() => ed.unlink(id, pid)}>Remove</button>
								{/if}
							</div>
							<NoteInput {id} parentId={pid} label="How {titleOf(v, pid)} shapes {titleOf(v, id)}" placeholder="How does {titleOf(v, pid)} shape this?" readonly={ro} />
						</li>
					{/each}
				</ol>
				{#if parents.length > 1}
					<p class="hint">When these pull in different directions, the higher one wins. It appears under each of them in the tree, with the same words everywhere.</p>
				{/if}
			</section>
		{/if}

		<section class="group">
			<h3>Grows into {n.children.length ? `(${n.children.length})` : ''}</h3>
			{#if n.children.length}
				<ul class="kids">
					{#each n.children as c (c)}
						<li>
							<button type="button" onclick={() => ed.select(pl.key + '/' + c, true)}>
								<span>{titleOf(v, c)}</span>
								{#if (v.parentsOf.get(c) || []).length > 1}<span class="shared-mark"><Icon name="branch" size={13} /> shared</span>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="hint">Nothing grows from this yet.{ro ? '' : ' Add a more specific value underneath it.'}</p>
			{/if}
		</section>

		{#if ancestors.length}
			<details class="group fold-group">
				<summary><h3>Everything that shapes this ({ancestors.length})</h3></summary>
				<p class="hint">Run a decision past each of these, starting at the top. The ticks are just for you and aren’t saved.</p>
				<ul class="checks">
					{#each ancestors as a (a)}
						{@const an = v.nodes[a]}
						<li class:done={ticks[a]}>
							<input type="checkbox" id="chk-{a}" bind:checked={ticks[a]} />
							<label for="chk-{a}">
								<span class="ck-title">{titleOf(v, a)}</span>
								{#if an.meaning}<span class="ck-text">{an.meaning}</span>{/if}
								{#if parents.includes(a) && noteOf(v, id, a)}<span class="ck-note">For {titleOf(v, id)}: {noteOf(v, id, a)}</span>{/if}
								{#if an.avoid}<span class="ck-text">Not this: {an.avoid}</span>{/if}
							</label>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

		{#if !ro}
			<details class="group fold-group">
				<summary><h3>Connect to another parent</h3></summary>
				<p class="hint">Use this when a value grows from more than one place, like Forgiveness growing from both Love and Honesty.</p>
				{#if linkable.length}
					<div class="field">
						<label for="f-link">Also grows from</label>
						<select id="f-link" onchange={(e) => {
							const t = e.currentTarget.value;
							e.currentTarget.value = '';
							if (t) ed.link(id, t);
						}}>
							<option value="">Choose a value…</option>
							{#each linkable as o (o.id)}<option value={o.id}>{pad(o.depth)}{titleOf(v, o.id)}</option>{/each}
						</select>
					</div>
				{:else}
					<p class="hint">There’s no other value it can connect to without making a loop.</p>
				{/if}
			</details>

			<details class="group fold-group">
				<summary><h3>Arrange{parents.length > 1 ? ' in this spot' : ''}</h3></summary>
				<div class="row">
					<button type="button" class="btn small" disabled={pl.i === 0} onclick={() => ed.moveSibling(-1)}><Icon name="arrowUp" /> Move up</button>
					<button type="button" class="btn small" disabled={pl.i === pl.list.length - 1} onclick={() => ed.moveSibling(1)}><Icon name="arrowDown" /> Move down</button>
					<button
						type="button"
						class="btn small"
						disabled={!canMoveOut(v, pl.key)}
						title={pl.depth === 1 && parents.length > 1 ? 'A value with other parents can’t be a root value. Remove its other links first.' : 'Make it a sibling of the value it grows from here'}
						onclick={() => ed.moveOut()}>Move out a level</button
					>
					<button type="button" class="btn small" disabled={!canMoveIn(v, pl.key)} title="Put it under the value above it" onclick={() => ed.moveIn()}>Move under the one above</button>
				</div>
				{#if movable.length || pl.depth > 0}
					<div class="field">
						<label for="f-move">Move {parents.length > 1 ? 'this link ' : ''}under another value</label>
						<select id="f-move" onchange={(e) => {
							const t = e.currentTarget.value;
							e.currentTarget.value = '';
							if (t) ed.moveTo(pl.key, t === '__root' ? null : t);
						}}>
							<option value="">Choose where to move it…</option>
							{#if pl.depth > 0}<option value="__root">Make it a root value{parents.length > 1 ? ' (removes all its links)' : ''}</option>{/if}
							{#each movable as o (o.id)}<option value={o.id}>{pad(o.depth)}{titleOf(v, o.id)}</option>{/each}
						</select>
					</div>
				{/if}
			</details>

			<div class="danger-zone">
				<button type="button" class="btn danger small" onclick={() => ed.askDelete(pl.key)}><Icon name="trash" /> Delete this value…</button>
			</div>
		{/if}
	</div>
{:else}
	<div class="panel-body about">
		<h2>About this tree</h2>
		<p class="hint">
			Root values sit on the left. Each value that branches from them is shaped by them and gets more specific as it goes. A value can grow from more than one parent.
			{ro ? 'Select any value to read it in full.' : 'Select any value to edit it.'}
		</p>
		<div class="field">
			<label for="f-intro">Why we’re writing this <span class="sub">opens the document</span></label>
			<textarea id="f-intro" rows="3" placeholder={ro ? 'No introduction yet.' : 'What do we hope this gives our family?'} use:bindText={{ text: ed.metaText('intro'), readonly: ro, autosize: true }}></textarea>
		</div>
		<dl class="stats">
			<div><dt>Root values</dt><dd>{v.stats.roots}</dd></div>
			<div><dt>Values in all</dt><dd>{v.stats.total}</dd></div>
			<div><dt>Levels deep</dt><dd>{v.stats.deepest}</dd></div>
		</dl>
		{#if v.stats.shared}
			<p class="hint">{v.stats.shared} {v.stats.shared === 1 ? 'value grows' : 'values grow'} from more than one parent.</p>
		{/if}
		{#if !ro}
			<div class="row"><button type="button" class="btn primary" onclick={() => ed.addRoot()}><Icon name="plus" /> Add a root value</button></div>
		{/if}
		<Shortcuts editable={!ro} />
	</div>
{/if}

<style>
	.panel-body {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 20px 22px 32px;
	}
	.where {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		justify-content: space-between;
	}
	.close {
		margin: -6px -8px 0 0;
		flex: none;
	}
	.lineage {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 2px 4px;
		font-size: var(--t-sm);
		color: var(--muted);
		padding-top: 2px;
	}
	.lineage .lead {
		margin-right: 2px;
	}
	.lineage button {
		border: 0;
		background: none;
		padding: 1px 3px;
		border-radius: 4px;
		color: var(--ink-2);
		font-weight: 520;
		text-decoration: underline;
		text-decoration-color: var(--line-strong);
		text-underline-offset: 3px;
	}
	.lineage button:hover {
		color: var(--accent);
		text-decoration-color: currentColor;
	}
	.root-mark {
		display: inline-block;
		width: 9px;
		height: 9px;
		border-radius: 2px;
		background: var(--hue);
		margin-right: 6px;
	}
	.title-field #f-title {
		font-family: var(--font-display);
		font-variation-settings: 'opsz' 60;
		font-weight: 600;
		font-size: var(--t-2xl);
		line-height: 1.15;
		letter-spacing: -0.01em;
		padding: 2px 0 4px;
		border: 0;
		border-bottom: 1.5px solid var(--line);
		border-radius: 0;
		background: transparent;
	}
	.title-field #f-title:focus {
		box-shadow: none;
		background: transparent;
		border-bottom-color: var(--accent);
	}
	.title-field #f-title:global([readonly]) {
		border-bottom-color: transparent;
		border-style: solid;
	}
	.kind {
		font-size: var(--t-xs);
		color: color-mix(in srgb, var(--hue) 70%, var(--muted));
		font-weight: 550;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	h2 {
		font-size: var(--t-xl);
	}
	h3 {
		font-size: var(--t-sm);
		font-weight: 650;
		color: var(--ink);
	}
	.hint {
		font-size: var(--t-sm);
		color: var(--muted);
	}
	.fold-group summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 28px;
	}
	.fold-group summary::-webkit-details-marker {
		display: none;
	}
	.fold-group summary::before {
		content: '';
		width: 7px;
		height: 7px;
		border-right: 1.6px solid var(--muted);
		border-bottom: 1.6px solid var(--muted);
		transform: rotate(-45deg);
		transition: transform 0.15s var(--ease);
		margin: 0 3px 0 1px;
	}
	.fold-group[open] summary::before {
		transform: rotate(45deg);
	}
	.fold-group[open] {
		gap: 12px;
	}
	.shaped {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.shaped li {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.shaped-head {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.rank {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 12px;
		font-weight: 650;
		display: grid;
		place-items: center;
		font-variant-numeric: tabular-nums;
		margin-right: 4px;
	}
	.plink {
		flex: 1;
		min-width: 0;
		text-align: left;
		border: 0;
		background: none;
		padding: 4px 2px;
		font-family: var(--font-display);
		font-weight: 560;
		font-size: 16px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.plink:hover {
		color: var(--accent);
	}
	.kids {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.kids button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 36px;
		text-align: left;
		border: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
		background: none;
		padding: 6px 2px;
		font-family: var(--font-display);
		font-size: 15.5px;
	}
	.kids li:last-child button {
		border-bottom: 0;
	}
	.kids button:hover {
		color: var(--accent);
	}
	.shared-mark {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-ui);
		font-size: var(--t-xs);
		color: var(--muted);
	}
	.checks {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.checks li {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		background: var(--paper);
		border-radius: var(--r-sm);
		padding: 9px 11px;
	}
	.checks input {
		margin-top: 3px;
		accent-color: var(--accent);
		width: 16px;
		height: 16px;
		flex: none;
	}
	.checks label {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.checks li.done label {
		opacity: 0.5;
	}
	.ck-title {
		font-weight: 600;
		font-size: var(--t-md);
	}
	.ck-text {
		color: var(--muted);
	}
	.ck-note {
		font-family: var(--font-display);
		font-style: italic;
	}
	.danger-zone {
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin: 0;
	}
	.stats div {
		border-top: 2px solid var(--line);
		padding: 8px 0 0;
	}
	.stats dt {
		font-size: var(--t-xs);
		color: var(--muted);
	}
	.stats dd {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--t-2xl);
		font-weight: 560;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
	}
	.about .hint {
		max-width: 52ch;
	}
</style>
