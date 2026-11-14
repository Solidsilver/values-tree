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

	const paras = (t: string) =>
		t
			.trim()
			.split(/\n\s*\n/)
			.filter(Boolean)
			.map((p) => p.split('\n'));

	async function copyMd() {
		if (await copyText(toMarkdown(v))) toast.show('Copied the document as Markdown');
		else toast.show('Your browser blocked the clipboard. Use Export instead.');
	}
	function sel(id: string) {
		const k = v.firstKey.get(id);
		if (k) ed.select(k);
	}
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
	<div class="doc-tools">
		<button type="button" class="btn small" onclick={copyMd}><Icon name="copy" /> Copy as Markdown</button>
		<button type="button" class="btn small" onclick={() => window.print()}><Icon name="print" /> Print or save as PDF</button>
	</div>
	<article class="doc">
		<h1>{v.title}</h1>
		{#if v.intro.trim()}<div class="intro">{@render lines(v.intro)}</div>{/if}
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
		padding: 28px clamp(16px, 5vw, 56px) 96px;
	}
	.doc-tools {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		max-width: 70ch;
		margin: 0 auto 8px;
	}
	.doc {
		max-width: 66ch;
		margin: 0 auto;
		font-size: 16.5px;
		line-height: 1.6;
	}
	h1 {
		font-size: var(--t-3xl);
		line-height: 1.05;
		margin: 24px 0 18px;
		font-variation-settings: 'opsz' 144;
	}
	.intro {
		font-family: var(--font-display);
		font-size: 19px;
		line-height: 1.55;
		color: var(--ink-2);
		margin-bottom: 36px;
		font-variation-settings: 'opsz' 18;
	}
	.intro p,
	.meaning :global(p) {
		margin: 0 0 10px;
	}
	.doc-node {
		margin: 20px 0 8px;
		padding-left: 20px;
		border-left: 1.5px solid color-mix(in srgb, var(--hue) 45%, transparent);
	}
	.doc-node .doc-node {
		margin: 16px 0 6px;
	}
	.doc-node.d0 {
		margin-top: 48px;
		border-left-width: 4px;
	}
	.doc-node.selected > .doc-h button {
		text-decoration: underline;
		text-decoration-color: var(--accent);
		text-decoration-thickness: 2px;
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
		font-size: 15px;
		color: var(--ink-2);
		margin: 6px 0 10px;
	}
	.shaped ol {
		margin: 4px 0 0;
		padding-left: 22px;
	}
	.ref {
		all: unset;
		cursor: pointer;
		color: var(--accent);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
	}
	.ref:focus-visible {
		outline: 2px solid var(--focus);
	}
	.also {
		font-size: 15px;
		color: var(--muted);
		margin: 6px 0 8px 20px;
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
		.doc-tools {
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
		}
		.doc-h {
			break-after: avoid;
		}
		.d0 {
			break-before: auto;
		}
		.ref {
			color: inherit;
			text-decoration: none;
		}
		.doc-node.selected > .doc-h button {
			text-decoration: none;
		}
	}
</style>
