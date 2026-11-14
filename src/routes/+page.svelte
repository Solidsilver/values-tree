<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { forget, linkFor, listRecents, type Recent } from '$lib/client/recents.ts';
	import { createTreeRequest, readFile } from '$lib/client/files.ts';
	import { parseImport } from '$lib/model/io.ts';
	import { theme } from '$lib/client/theme.svelte.ts';
	import Icon from '$lib/components/Icon.svelte';

	let recents = $state<Recent[]>([]);
	let busy = $state<null | 'blank' | 'example' | 'import'>(null);
	let error = $state('');
	let dragging = $state(false);
	let mounted = $state(false);

	onMount(() => {
		theme.init();
		recents = listRecents();
		mounted = true;
	});

	async function start(source: 'blank' | 'example') {
		busy = source;
		error = '';
		try {
			const r = await createTreeRequest({ source });
			goto('/e/' + r.editToken + '?new=1');
		} catch (e) {
			error = (e as Error).message;
			busy = null;
		}
	}

	async function importFile(f: File | undefined) {
		if (!f) return;
		error = '';
		let text: string;
		try {
			text = await readFile(f);
		} catch {
			error = 'That file couldn’t be read.';
			return;
		}
		const parsed = parseImport(text);
		if (!parsed.ok) {
			error = parsed.error;
			return;
		}
		busy = 'import';
		try {
			const t = parsed.tree;
			const r = await createTreeRequest({ source: 'import', tree: { ...t, nodes: Object.values(t.nodes) } });
			goto('/e/' + r.editToken + '?new=1');
		} catch (e) {
			error = (e as Error).message;
			busy = null;
		}
	}

	function when(ts: number) {
		const d = Date.now() - ts;
		const day = 86_400_000;
		if (d < 60_000) return 'just now';
		if (d < 3_600_000) return Math.round(d / 60_000) + ' min ago';
		if (d < day) return Math.round(d / 3_600_000) + ' h ago';
		if (d < 7 * day) return Math.round(d / day) + (Math.round(d / day) === 1 ? ' day ago' : ' days ago');
		return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function remove(r: Recent) {
		forget(r.treeId);
		recents = listRecents();
	}
</script>

<svelte:head>
	<title>Values Tree</title>
	<meta name="description" content="Write down what your family cares about, as a tree you build together." />
</svelte:head>

<div class="page">
	<header class="top">
		<span class="brand">
			<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16h5" /><path d="M12 16c4 0 4-7 9-7" /><path d="M12 16c4 0 4 7 9 7" /></g><circle cx="7" cy="16" r="3.2" fill="currentColor" /><circle cx="23" cy="9" r="2.6" fill="currentColor" /><circle cx="23" cy="23" r="2.6" fill="currentColor" /></svg>
			Values Tree
		</span>
		<button type="button" class="icon-btn" aria-label={mounted && theme.effective === 'dark' ? 'Use light theme' : 'Use dark theme'} onclick={() => theme.toggle()}>
			<Icon name={mounted && theme.effective === 'dark' ? 'sun' : 'moon'} />
		</button>
	</header>

	<main>
		<section class="hero">
			<div class="intro">
				<h1>Write down what your family cares about, and how it fits together.</h1>
				<p class="lede">
					A values tree starts from a few root values and branches into more specific ones, each shaped by what it grows from.
					You build it together, at the same time, from a link you share.
				</p>
				<div class="actions">
					<button type="button" class="btn primary big" disabled={!!busy} onclick={() => start('blank')}>
						{busy === 'blank' ? 'Starting…' : 'Start a new tree'}
					</button>
					<button type="button" class="btn big" disabled={!!busy} onclick={() => start('example')}>
						{busy === 'example' ? 'Starting…' : 'Start from an example'}
					</button>
				</div>
				<label
					class="import"
					class:dragging
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragging = false;
						importFile(e.dataTransfer?.files[0]);
					}}
				>
					<input type="file" accept=".json,application/json" disabled={!!busy} onchange={(e) => importFile(e.currentTarget.files?.[0])} />
					<Icon name="upload" />
					<span>{busy === 'import' ? 'Importing…' : 'Import a tree file'} <span class="sub">or drop a .json export here</span></span>
				</label>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
			</div>

			<figure class="sketch" aria-hidden="true">
				<svg viewBox="0 0 420 300">
					<g fill="none" stroke-linecap="round" stroke-width="2.4" opacity="0.6">
						<path d="M128 78 C170 78, 172 40, 214 40" stroke="var(--b1)" />
						<path d="M128 78 C170 78, 172 116, 214 116" stroke="var(--b1)" />
						<path d="M128 222 C170 222, 172 186, 214 186" stroke="var(--b2)" />
						<path d="M128 222 C170 222, 172 258, 214 258" stroke="var(--b2)" />
						<path d="M128 78 C175 78, 160 186, 214 186" stroke="var(--b1)" stroke-dasharray="1 6" />
					</g>
					<g>
						<rect x="20" y="56" width="108" height="44" rx="9" fill="color-mix(in srgb, var(--b1) 10%, var(--surface))" stroke="color-mix(in srgb, var(--b1) 45%, var(--line))" stroke-width="1.5" />
						<rect x="20" y="56" width="6" height="44" rx="3" fill="var(--b1)" />
						<text x="40" y="84" class="t root">Love</text>
						<rect x="20" y="200" width="108" height="44" rx="9" fill="color-mix(in srgb, var(--b2) 10%, var(--surface))" stroke="color-mix(in srgb, var(--b2) 45%, var(--line))" stroke-width="1.5" />
						<rect x="20" y="200" width="6" height="44" rx="3" fill="var(--b2)" />
						<text x="40" y="228" class="t root">Honesty</text>
						{#each [{ y: 22, t: 'Kindness', h: 'var(--b1)' }, { y: 98, t: 'Hospitality', h: 'var(--b1)' }, { y: 168, t: 'Forgiveness', h: 'var(--b2)', d: true }, { y: 240, t: 'Promises', h: 'var(--b2)' }] as c (c.t)}
							<rect x="214" y={c.y} width="116" height="36" rx="8" fill="var(--surface)" stroke="color-mix(in srgb, {c.h} 25%, var(--line))" stroke-dasharray={c.d ? '4 3' : undefined} />
							<rect x="214" y={c.y + 9} width="3" height="18" rx="1.5" fill={c.h} />
							<text x="228" y={c.y + 23} class="t">{c.t}</text>
						{/each}
					</g>
				</svg>
			</figure>
		</section>

		<section class="recents" aria-labelledby="recents-h">
			<h2 id="recents-h">Your trees</h2>
			<p class="note">
				This list lives in this browser only. The link is the only way back to a tree, so keep your edit links somewhere safe.
			</p>
			{#if mounted && recents.length}
				<ul>
					{#each recents as r (r.treeId)}
						<li>
							<a href={linkFor(r)} class="tree-link">
								<span class="t">{r.title || 'Untitled tree'}</span>
								<span class="meta">
									<span class="role {r.role}">{r.role === 'edit' ? 'Can edit' : 'View only'}</span>
									<span>Opened {when(r.lastOpened)}</span>
									{#if r.unsaved}<span class="warn">Edit link not saved yet</span>{/if}
								</span>
							</a>
							<button type="button" class="btn quiet small" aria-label="Forget {r.title || 'this tree'} on this device" onclick={() => remove(r)}>Forget</button>
						</li>
					{/each}
				</ul>
			{:else if mounted}
				<p class="empty">Trees you open or create in this browser will be listed here.</p>
			{/if}
		</section>
	</main>

	<footer class="foot">
		<p>Self-hosted and open. Your trees live on this server; nothing is sent anywhere else.</p>
	</footer>
</div>

<style>
	.page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		background-color: var(--paper);
		background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) calc(var(--grain) * 100%), transparent) 1px, transparent 0);
		background-size: 22px 22px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px clamp(16px, 4vw, 48px);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: var(--t-lg);
		color: var(--accent);
	}
	main {
		flex: 1;
		width: 100%;
		max-width: 1120px;
		margin: 0 auto;
		padding: clamp(16px, 5vw, 56px) clamp(16px, 4vw, 48px) 48px;
		display: flex;
		flex-direction: column;
		gap: clamp(48px, 8vw, 88px);
	}
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
		gap: 48px;
		align-items: center;
	}
	.intro {
		display: flex;
		flex-direction: column;
		gap: 22px;
		animation: enter 0.5s var(--ease);
	}
	h1 {
		font-size: clamp(34px, 5.2vw, 58px);
		line-height: 1.03;
		font-variation-settings: 'opsz' 144;
		font-weight: 520;
		letter-spacing: -0.02em;
	}
	.lede {
		font-size: var(--t-lg);
		line-height: 1.55;
		color: var(--ink-2);
		max-width: 50ch;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.big {
		min-height: 48px;
		padding: 10px 22px;
		font-size: var(--t-md);
	}
	.import {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		align-self: flex-start;
		padding: 10px 16px;
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--r);
		color: var(--ink-2);
		font-weight: 520;
		font-size: var(--t-sm);
		cursor: pointer;
	}
	.import .sub {
		font-weight: 400;
		color: var(--muted);
	}
	.import:hover,
	.import.dragging {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.import:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.import input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.error {
		color: var(--danger);
		font-size: var(--t-sm);
	}
	.sketch {
		margin: 0;
		animation: enter 0.7s var(--ease);
	}
	.sketch svg {
		width: 100%;
		height: auto;
		display: block;
	}
	.sketch :global(.t) {
		font-family: var(--font-display);
		font-size: 14px;
		fill: var(--ink);
	}
	.sketch :global(.t.root) {
		font-size: 17px;
		font-weight: 600;
	}
	.recents {
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-width: 720px;
	}
	h2 {
		font-size: var(--t-2xl);
	}
	.note {
		color: var(--muted);
		max-width: 60ch;
	}
	ul {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid var(--line);
	}
	.tree-link {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 14px 4px;
		color: inherit;
		text-decoration: none;
	}
	.tree-link .t {
		font-family: var(--font-display);
		font-size: var(--t-lg);
		font-weight: 560;
	}
	.tree-link:hover .t {
		color: var(--accent);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		font-size: var(--t-sm);
		color: var(--muted);
	}
	.role.edit {
		color: var(--accent);
		font-weight: 550;
	}
	.warn {
		color: var(--danger);
	}
	.empty {
		color: var(--muted);
		font-style: italic;
		padding: 12px 0;
	}
	.foot {
		padding: 24px clamp(16px, 4vw, 48px);
		color: var(--muted);
		font-size: var(--t-sm);
		max-width: 1120px;
		width: 100%;
		margin: 0 auto;
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
	@media (max-width: 820px) {
		.hero {
			grid-template-columns: 1fr;
			gap: 28px;
		}
		.sketch {
			max-width: 420px;
			order: -1;
		}
	}
	@media (max-width: 480px) {
		.actions .btn {
			flex: 1 1 100%;
		}
		.sketch {
			display: none;
		}
	}
</style>
