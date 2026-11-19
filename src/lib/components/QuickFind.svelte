<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { outline, titleOf } from '$lib/model/derive.ts';
	import Modal from './Modal.svelte';

	const ed = useEditor();
	const v = $derived(ed.s.view);
	let q = $state('');
	let active = $state(0);

	const results = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		let r = -1;
		const list = outline(v).map((o) => {
			if (o.depth === 0) r++;
			const parents = (v.parentsOf.get(o.id) || []).map((pid) => titleOf(v, pid));
			return {
				...o,
				rootIdx: Math.max(0, r),
				title: titleOf(v, o.id),
				meaning: v.nodes[o.id].meaning,
				context: parents.length ? parents.join(' · ') : 'Root value'
			};
		});
		if (!needle) return list.slice(0, 50);
		return list
			.map((o) => {
				const t = o.title.toLowerCase();
				const score = t.startsWith(needle) ? 0 : t.includes(needle) ? 1 : o.meaning.toLowerCase().includes(needle) ? 2 : 9;
				return { ...o, score };
			})
			.filter((o) => o.score < 9)
			.sort((a, b) => a.score - b.score)
			.slice(0, 50);
	});
	$effect(() => {
		void q;
		active = 0;
	});

	function go(id: string) {
		ed.findOpen = false;
		q = '';
		const k = v.firstKey.get(id);
		if (!k) return;
		if (ed.mode !== 'tree') ed.mode = 'tree';
		ed.select(k, true);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = Math.min(results.length - 1, active + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = Math.max(0, active - 1);
		} else if (e.key === 'Enter' && results[active]) {
			e.preventDefault();
			go(results[active].id);
		}
	}
</script>

<Modal bind:open={ed.findOpen} title="Find a value" size="sm" onclose={() => (q = '')}>
	<input
		class="input find"
		type="search"
		placeholder="Type a name…"
		aria-label="Find a value by name"
		aria-controls="find-results"
		aria-activedescendant={results[active] ? 'find-' + results[active].id : undefined}
		bind:value={q}
		{onkeydown}
		data-autofocus
	/>
	<ul id="find-results" role="listbox" aria-label="Matching values">
		{#each results as r, i (r.id)}
			<li id="find-{r.id}" role="option" aria-selected={i === active}>
				<button type="button" tabindex="-1" onclick={() => go(r.id)} onmouseenter={() => (active = i)}>
					<span class="dot" style:background="var(--b{(r.rootIdx % 5) + 1})" aria-hidden="true"></span>
					<span class="col">
						<span class="t">{r.title}</span>
						<span class="ctx">{r.context}</span>
					</span>
				</button>
			</li>
		{:else}
			<li class="none">No value matches “{q}”.</li>
		{/each}
	</ul>
	<p class="keys-hint" aria-hidden="true">
		<span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
		<span><kbd>Enter</kbd> jump</span>
		<span><kbd>Esc</kbd> close</span>
	</p>
</Modal>

<style>
	.find {
		font-size: var(--t-lg);
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		background: var(--input-bg);
		width: 100%;
	}
	.find:focus {
		outline: none;
		border-color: var(--accent);
		background: var(--surface);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 48vh;
		overflow: auto;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		text-align: left;
		border: 0;
		background: none;
		padding: 8px 10px;
		border-radius: var(--r-sm);
		min-height: 44px;
		transition: background-color 0.1s var(--ease);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}
	.col {
		display: flex;
		flex-direction: column;
		min-width: 0;
		gap: 1px;
	}
	.t {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 560;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ctx {
		font-size: var(--t-xs);
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	li[aria-selected='true'] button {
		background: var(--accent-soft);
		color: var(--ink);
	}
	.none {
		color: var(--muted);
		padding: 10px;
		font-size: var(--t-sm);
	}
	.keys-hint {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		font-size: var(--t-xs);
		color: var(--muted) !important;
	}
	.keys-hint span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
</style>
