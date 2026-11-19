<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { docPlan, noteOf, titleOf } from '$lib/model/derive.ts';
	import { toMarkdown } from '$lib/model/io.ts';
	import { copyText } from '$lib/client/files.ts';
	import { toast } from '$lib/client/toast.svelte.ts';
	import Icon from './Icon.svelte';

	const ed = useEditor();
	const s = ed.s;
	const v = $derived(s.view);
	const plan = $derived(docPlan(v));
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;

	const paras = (t: string) =>
		t
			.trim()
			.split(/\n\s*\n/)
			.filter(Boolean)
			.map((p) => p.split('\n'));

	async function copyMd() {
		if (await copyText(toMarkdown(v))) {
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1800);
			toast.show('Copied the document as Markdown');
		} else toast.show('Your browser blocked the clipboard. Use Export instead.');
	}
	function sel(id: string) {
		const k = v.firstKey.get(id);
		if (k) ed.select(k);
	}
	const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
</script>

{#snippet lines(text: string)}
	{#each paras(text) as p, i (i)}
		<p>{#each p as line, j (j)}{#if j}<br />{/if}{line}{/each}</p>
	{/each}
{/snippet}

{#snippet inlineText(text: string)}
	{#each text.trim().split('\n') as line, j (j)}{#if j}<br />{/if}{line}{/each}
{/snippet}

{#snippet node(id: string, depth: number, ri: number)}
	{@const n = v.nodes[id]}
	{@const parents = v.parentsOf.get(id) || []}
	{@const showShaped = parents.length > 1 || parents.some((x) => noteOf(v, id, x))}
	<section class="doc-node d{Math.min(depth, 4)}" class:selected={s.selected?.id === id} style:--hue={depth === 0 ? `var(--b${(ri % 5) + 1})` : undefined}>
		<svelte:element this={'h' + Math.min(depth + 2, 6)} class="doc-h">
			<button type="button" onclick={() => sel(id)}><span class="num">{plan.num[id]}</span>{titleOf(v, id)}</button>
		</svelte:element>
		{#if n.meaning.trim()}<div class="meaning">{@render lines(n.meaning)}</div>{/if}
		{#if n.practice.trim()}<p class="live"><strong>How we live it.</strong> {@render inlineText(n.practice)}</p>{/if}
		{#if n.avoid.trim()}<p class="live avoid"><strong>Not this.</strong> {@render inlineText(n.avoid)}</p>{/if}
		{#if showShaped}
			<div class="shaped">
				<strong>Shaped by</strong>
				<ol>
					{#each parents as o (o)}
						<li><button type="button" class="ref" onclick={() => sel(o)}>{titleOf(v, o)}</button>{#if noteOf(v, id, o)}: <em>{noteOf(v, id, o)}</em>{/if}</li>
					{/each}
				</ol>
			</div>
		{/if}
		{#each n.children as c (c)}
			{#if plan.home[c] === id}
				{@render node(c, depth + 1, ri)}
			{:else}
				<p class="also">Also includes <button type="button" class="ref" onclick={() => sel(c)}>{plan.num[c]} {titleOf(v, c)}</button></p>
			{/if}
		{/each}
	</section>
{/snippet}

<div class="docview">
	<div class="doc-bar">
		<span class="doc-meta">
			{#if v.stats.total}
				{plural(v.stats.roots, 'root value')} · {plural(v.stats.total, 'value')}
			{:else}
				Empty document
			{/if}
		</span>
		<div class="doc-tools">
			<button type="button" class="btn small" onclick={copyMd}>
				<Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy as Markdown'}
			</button>
			<button type="button" class="btn small" onclick={() => window.print()}><Icon name="print" /> Print or save as PDF</button>
		</div>
	</div>
	<article class="doc">
		<header class="doc-header">
			<h1>{v.title}</h1>
			{#if v.intro.trim()}<div class="intro">{@render lines(v.intro)}</div>{/if}
		</header>
		{#if v.roots.length}
			{#each v.roots as r, i (r)}{@render node(r, 0, i)}{/each}
		{:else}
			<p class="empty">No values yet. {ed.canEdit ? 'Switch to the Tree view to add your first root value.' : 'They will appear here once someone adds them.'}</p>
		{/if}
	</article>
</div>

<style>
	.docview {
		height: 100%;
		overflow: auto;
		padding: 20px clamp(16px, 5vw, 56px) 96px;
	}
	.doc-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		max-width: 66ch;
		margin: 0 auto 28px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--line);
	}
	.doc-meta {
		font-size: var(--t-xs);
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.doc-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.doc {
		max-width: 66ch;
		margin: 0 auto;
		font-size: 16.5px;
		line-height: 1.64;
	}
	.doc-header {
		margin-bottom: 36px;
	}
	h1 {
		font-size: clamp(32px, 4.2vw, var(--t-3xl));
		line-height: 1.06;
		margin: 0 0 16px;
		font-variation-settings: 'opsz' 144;
	}
	.intro {
		font-family: var(--font-display);
		font-size: 19px;
		line-height: 1.56;
		color: var(--ink-2);
		font-variation-settings: 'opsz' 18;
	}
	.intro p,
	.meaning :global(p) {
		margin: 0 0 10px;
	}
	.doc-node {
		margin: 20px 0 8px;
		padding: 2px 10px 2px 20px;
		border-left: 1.5px solid color-mix(in srgb, var(--hue) 44%, transparent);
		border-radius: 0 var(--r-sm) var(--r-sm) 0;
		transition:
			background-color 0.16s var(--ease),
			border-color 0.16s var(--ease);
	}
	.doc-node .doc-node {
		margin: 16px 0 6px;
	}
	.doc-node.d0 {
		margin-top: 44px;
		border-left-width: 4px;
	}
	.doc-node.selected {
		background: color-mix(in srgb, var(--accent) 7%, transparent);
		border-left-color: var(--accent);
		padding-top: 8px;
		padding-bottom: 8px;
	}
	.doc-node.selected > .doc-h button {
		color: var(--accent);
	}
	.doc-h {
		margin: 0 0 6px;
		text-wrap: balance;
		font-family: var(--font-display);
		font-weight: 560;
		line-height: 1.25;
	}
	.doc-h button {
		all: unset;
		cursor: pointer;
		border-radius: 3px;
		transition: color 0.14s var(--ease);
	}
	.doc-h button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.doc-h button:hover {
		color: var(--accent);
	}
	.num {
		color: color-mix(in srgb, var(--hue) 80%, var(--muted));
		font-variant-numeric: tabular-nums;
		margin-right: 0.45em;
		font-weight: 450;
	}
	.d0 > .doc-h {
		font-size: var(--t-2xl);
		font-variation-settings: 'opsz' 96;
	}
	.d1 > .doc-h {
		font-size: 22px;
	}
	.d2 > .doc-h {
		font-size: 19px;
	}
	.d3 > .doc-h,
	.d4 > .doc-h {
		font-size: 17px;
	}
	.live {
		margin: 0 0 8px;
		color: var(--ink-2);
	}
	.live strong {
		font-weight: 650;
		color: var(--ink);
	}
	.avoid strong {
		color: var(--danger);
	}
	.shaped {
		font-size: 14.5px;
		color: var(--ink-2);
		margin: 10px 0 12px;
		padding: 9px 13px;
		border-radius: var(--r-sm);
		background: color-mix(in srgb, var(--surface) 60%, var(--paper));
		border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
	}
	.shaped strong {
		font-size: var(--t-xs);
		font-weight: 600;
		color: var(--muted);
	}
	.shaped ol {
		margin: 4px 0 0;
		padding-left: 20px;
	}
	.shaped em {
		font-family: var(--font-display);
	}
	.ref {
		all: unset;
		cursor: pointer;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: color-mix(in srgb, var(--accent) 42%, transparent);
	}
	.ref:hover {
		text-decoration-color: currentColor;
	}
	.ref:focus-visible {
		outline: 2px solid var(--focus);
	}
	.also {
		font-size: 15px;
		color: var(--muted);
		margin: 8px 0 8px 20px;
		font-style: italic;
	}
	.empty {
		color: var(--muted);
		font-style: italic;
	}
	@media print {
		.docview {
			height: auto;
			overflow: visible;
			padding: 0;
		}
		.doc-bar {
			display: none;
		}
		.doc {
			max-width: none;
			font-size: 11.5pt;
			color: #000;
		}
		h1 {
			font-size: 28pt;
			margin-top: 0;
		}
		.intro {
			color: #222;
			font-size: 13pt;
		}
		.doc-node {
			break-inside: auto;
			background: none !important;
			padding-top: 0 !important;
			padding-bottom: 0 !important;
		}
		.doc-h {
			break-after: avoid;
		}
		.d0 {
			break-before: auto;
		}
		.shaped {
			background: none;
			border: 0;
			padding: 0;
		}
		.ref {
			color: inherit;
			text-decoration: none;
		}
		.doc-node.selected > .doc-h button {
			color: inherit;
		}
	}
</style>
