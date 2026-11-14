<script lang="ts">
	import { untrack } from 'svelte';
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { fetchVersion, fetchVersions, saveCheckpoint, type Version, type VersionDetail } from '$lib/client/history.ts';
	import { derive, outline, titleOf } from '$lib/model/derive.ts';
	import { docFromTree } from '$lib/model/schema.ts';
	import { diffTrees } from '$lib/model/diff.ts';
	import Modal from './Modal.svelte';

	const ed = useEditor();
	const s = ed.s;

	let versions = $state<Version[] | null>(null);
	let listError = $state('');
	let selectedId = $state<number | null>(null);
	let detail = $state.raw<VersionDetail | null>(null);
	let detailError = $state('');
	let confirming = $state(false);
	let busy = $state(false);
	const cache = new Map<number, VersionDetail>();

	$effect(() => {
		if (ed.historyOpen) untrack(load);
	});

	async function load() {
		versions = null;
		listError = '';
		confirming = false;
		try {
			versions = await fetchVersions(s.token);
			if (versions.length) pick(versions[0].id);
		} catch (e) {
			listError = (e as Error).message;
		}
	}

	async function pick(id: number) {
		selectedId = id;
		confirming = false;
		detailError = '';
		const hit = cache.get(id);
		if (hit) {
			detail = hit;
			return;
		}
		detail = null;
		try {
			const d = await fetchVersion(s.token, id);
			cache.set(id, d);
			if (selectedId === id) detail = d;
		} catch (e) {
			if (selectedId === id) detailError = (e as Error).message;
		}
	}

	const preview = $derived.by(() => {
		if (!detail) return null;
		const doc = docFromTree(detail.tree);
		const v = derive(doc);
		doc.destroy();
		return v;
	});
	const diff = $derived(detail ? diffTrees(detail.tree.nodes, s.view.nodes) : null);
	const back = $derived(new Set(diff?.back));
	const changed = $derived(new Set(diff?.changed));
	const same = $derived(!!diff && !diff.back.length && !diff.gone.length && !diff.changed.length && preview?.title === s.view.title && preview?.intro === s.view.intro);
	const online = $derived(s.conn === 'synced');

	const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
	const yearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

	function dayLabel(at: number): string {
		const d = new Date(at);
		const today = new Date();
		const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
		const diffDays = Math.round((start(today) - start(d)) / 86_400_000);
		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		return d.getFullYear() === today.getFullYear() ? dayFmt.format(d) : yearFmt.format(d);
	}

	const groups = $derived.by(() => {
		const out: { label: string; items: Version[] }[] = [];
		for (const v of versions || []) {
			const label = dayLabel(v.at);
			if (out.at(-1)?.label === label) out.at(-1)!.items.push(v);
			else out.push({ label, items: [v] });
		}
		return out;
	});

	const kindLabel = (k: Version['kind']) => (k === 'created' ? 'When the tree was made' : k === 'restore' ? 'Saved before a restore' : '');
	const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

	async function restore() {
		if (!detail) return;
		busy = true;
		try {
			await saveCheckpoint(s.token);
			const when = longFmt.format(new Date(detail.at));
			if (ed.replaceAll(detail.tree, `Restored the version from ${when}. Undo puts it back the way it was.`)) {
				cache.clear();
				ed.historyOpen = false;
			}
		} catch (e) {
			detailError = (e as Error).message;
		} finally {
			busy = false;
			confirming = false;
		}
	}

	function onListKey(e: KeyboardEvent) {
		if (!versions?.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
		e.preventDefault();
		const i = versions.findIndex((v) => v.id === selectedId);
		const next = versions[Math.max(0, Math.min(versions.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
		pick(next.id);
		(e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
	}
</script>

<Modal bind:open={ed.historyOpen} title="Version history" size="xl" onclose={() => (confirming = false)}>
	<p class="lede">
		A copy of the tree is saved every few minutes while people edit, and kept for months (fewer copies as they get older). Only people with the edit link
		can see this.
	</p>

	{#if listError}
		<p class="error" role="alert">{listError}</p>
	{:else if !versions}
		<p class="quiet" role="status">Loading saved versions…</p>
	{:else if !versions.length}
		<p class="quiet">No saved versions yet. The first one is made a few minutes after someone edits.</p>
	{:else}
		<div class="split">
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<nav class="list" aria-label="Saved versions" onkeydown={onListKey}>
				{#each groups as g (g.label)}
					<h3>{g.label}</h3>
					<ul>
						{#each g.items as v (v.id)}
							<li>
								<button
									type="button"
									data-id={v.id}
									aria-current={v.id === selectedId ? 'true' : undefined}
									tabindex={v.id === selectedId ? 0 : -1}
									onclick={() => pick(v.id)}
								>
									<span class="time">{timeFmt.format(new Date(v.at))}</span>
									<span class="sub">{[plural(v.values, 'value'), kindLabel(v.kind)].filter(Boolean).join(' · ')}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/each}
			</nav>

			<section class="preview" aria-live="polite" aria-busy={!detail && !detailError}>
				{#if detailError}
					<p class="error" role="alert">{detailError}</p>
				{:else if !detail || !preview || !diff}
					<p class="quiet">Loading…</p>
				{:else}
					<header>
						<p class="when">{longFmt.format(new Date(detail.at))}</p>
						<h3 class="ttl">{preview.title}</h3>
						<div class="chips">
							{#if same}
								<span class="chip">Same as the tree now</span>
							{:else}
								{#if diff.back.length}<span class="chip back">{plural(diff.back.length, 'value')} come{diff.back.length === 1 ? 's' : ''} back</span>{/if}
								{#if diff.changed.length}<span class="chip changed">{plural(diff.changed.length, 'value')} changed</span>{/if}
								{#if diff.gone.length}<span class="chip gone">{plural(diff.gone.length, 'value')} added since</span>{/if}
								{#if !diff.back.length && !diff.changed.length && !diff.gone.length}<span class="chip">Title or intro differs</span>{/if}
							{/if}
						</div>
					</header>
					{#if preview.roots.length}
						<ol class="outline">
							{#each outline(preview) as row (row.id)}
								<li style:--depth={row.depth} class:root={row.depth === 0} class:back={back.has(row.id)} class:changed={changed.has(row.id)}>
									<span class="dot" aria-hidden="true"></span>
									<span class="name">{titleOf(preview, row.id)}</span>
									{#if back.has(row.id)}<span class="tag">comes back</span>{:else if changed.has(row.id)}<span class="tag">changed</span>{/if}
								</li>
							{/each}
						</ol>
					{:else}
						<p class="quiet">This version was empty.</p>
					{/if}
					{#if diff.gone.length}
						<p class="gone-note">
							<strong>Restoring removes</strong>
							{diff.gone.map((id) => titleOf(s.view, id)).join(', ')}.
						</p>
					{/if}
				{/if}
			</section>
		</div>
	{/if}

	{#snippet actions()}
		{#if confirming}
			<p class="confirm" role="alert">This replaces the tree for everyone editing it. The current tree is saved here first.</p>
			<button type="button" class="btn" disabled={busy} onclick={() => (confirming = false)}>Cancel</button>
			<button type="button" class="btn primary" disabled={busy || !online} onclick={restore}>{busy ? 'Restoring…' : 'Restore for everyone'}</button>
		{:else}
			{#if !online && versions?.length}<p class="confirm">Reconnect to restore a version.</p>{/if}
			<button type="button" class="btn" onclick={() => (ed.historyOpen = false)}>Close</button>
			<button type="button" class="btn primary" disabled={!detail || same || !online || !ed.canEdit} onclick={() => (confirming = true)}>Restore this version</button>
		{/if}
	{/snippet}
</Modal>

<style>
	.lede {
		margin-top: -6px;
		font-size: var(--t-sm);
	}
	.quiet {
		color: var(--muted) !important;
		font-size: var(--t-sm);
	}
	.error {
		color: var(--danger) !important;
		font-size: var(--t-sm);
	}
	.split {
		display: grid;
		grid-template-columns: 230px 1fr;
		border: 1px solid var(--line);
		border-radius: var(--r);
		overflow: hidden;
		height: min(460px, calc(100dvh - 300px));
		min-height: 260px;
	}
	.list {
		overflow: auto;
		background: var(--paper);
		border-right: 1px solid var(--line);
		padding: 6px 0 10px;
	}
	.list h3 {
		position: sticky;
		top: -6px;
		z-index: 1;
		margin: 0;
		padding: 10px 16px 4px;
		background: var(--paper);
		font: 600 var(--t-xs) / 1.3 var(--font-ui);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.list ul {
		list-style: none;
		margin: 0;
		padding: 0 6px;
	}
	.list button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		width: 100%;
		padding: 7px 10px;
		border: 0;
		border-radius: var(--r-sm);
		background: transparent;
		text-align: left;
	}
	.list button:hover {
		background: var(--paper-2);
	}
	.list button[aria-current='true'] {
		background: var(--accent-soft);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.time {
		font-weight: 600;
		font-size: var(--t-sm);
		font-variant-numeric: tabular-nums;
	}
	.sub {
		font-size: var(--t-xs);
		color: var(--muted);
	}
	.preview {
		overflow: auto;
		padding: 18px 22px 22px;
		background: var(--surface);
	}
	.preview header {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-bottom: 14px;
		margin-bottom: 12px;
		border-bottom: 1px solid var(--line);
	}
	.when {
		font-size: var(--t-xs);
		color: var(--muted) !important;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
	}
	.ttl {
		font: 560 var(--t-xl) / 1.2 var(--font-display);
		font-variation-settings: 'opsz' 72;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.chip {
		font-size: var(--t-xs);
		font-weight: 600;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--paper-2);
		color: var(--ink-2);
	}
	.chip.back {
		background: color-mix(in srgb, var(--b1) 16%, var(--surface));
		color: color-mix(in srgb, var(--b1) 80%, var(--ink));
	}
	.chip.changed {
		background: color-mix(in srgb, var(--b3) 16%, var(--surface));
		color: color-mix(in srgb, var(--b3) 75%, var(--ink));
	}
	.chip.gone {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.outline {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.outline li {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 3px 0 3px calc(var(--depth) * 18px);
		font-size: var(--t-sm);
		line-height: 1.35;
	}
	.outline li.root {
		font-weight: 600;
		padding-top: 8px;
	}
	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--line-strong);
		transform: translateY(-1px);
	}
	.outline li.back .dot {
		background: var(--b1);
	}
	.outline li.changed .dot {
		background: var(--b3);
	}
	.tag {
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
		white-space: nowrap;
	}
	.outline li.back .tag {
		color: color-mix(in srgb, var(--b1) 85%, var(--ink));
	}
	.outline li.changed .tag {
		color: color-mix(in srgb, var(--b3) 80%, var(--ink));
	}
	.gone-note {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: var(--r-sm);
		background: var(--danger-soft);
		font-size: var(--t-sm);
		color: var(--ink) !important;
	}
	.confirm {
		flex: 1 1 260px;
		align-self: center;
		margin: 0;
		font-size: var(--t-sm);
		color: var(--ink-2);
	}
	@media (max-width: 700px) {
		.split {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
			height: calc(100dvh - 290px);
		}
		.list {
			border-right: 0;
			border-bottom: 1px solid var(--line);
			max-height: 34dvh;
		}
		.preview {
			padding: 14px 16px 18px;
		}
	}
</style>
