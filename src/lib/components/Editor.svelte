<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Session, type Role } from '$lib/client/session.svelte.ts';
	import { Editor, setEditor } from '$lib/client/editor.svelte.ts';
	import { bindText } from '$lib/client/bindText.ts';
	import { remember, updateRecent, listRecents } from '$lib/client/recents.ts';
	import { theme } from '$lib/client/theme.svelte.ts';
	import { toast } from '$lib/client/toast.svelte.ts';
	import { copyText, createTreeRequest } from '$lib/client/files.ts';
	import { exportData } from '$lib/model/io.ts';
	import TreeCanvas from './TreeCanvas.svelte';
	import DocView from './DocView.svelte';
	import Panel from './Panel.svelte';
	import Icon from './Icon.svelte';
	import ConnectionBadge from './ConnectionBadge.svelte';
	import Presence from './Presence.svelte';
	import ShareDialog from './ShareDialog.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import ImportDialog from './ImportDialog.svelte';
	import HistoryDialog from './HistoryDialog.svelte';
	import DeleteDialog from './DeleteDialog.svelte';
	import QuickFind from './QuickFind.svelte';
	import NameDialog from './NameDialog.svelte';

	let { treeId, role, token, initialTitle, viewToken: initialView = null }: { treeId: string; role: Role; token: string; initialTitle: string; viewToken?: string | null } =
		$props();

	// The page re-creates this component per tree ({#key}), so capturing initial props is intended.
	// svelte-ignore state_referenced_locally
	const s = new Session({ treeId, role, token });
	const ed = new Editor(s);
	setEditor(ed);
	// svelte-ignore state_referenced_locally
	let viewToken = $state<string | null>(initialView);
	let isNew = $state(false);
	let copying = $state(false);
	let moreOpen = $state(false);

	const mod = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl';
	const title = $derived(s.loaded ? s.view.title : initialTitle || 'Values tree');

	onMount(() => {
		theme.init();
		s.start();
		isNew = page.url.searchParams.get('new') === '1';
		const existing = listRecents().find((r) => r.treeId === treeId);
		remember({ treeId, token, role, title: initialTitle, unsaved: isNew ? true : existing?.unsaved });
		if (isNew) {
			const u = new URL(page.url);
			u.searchParams.delete('new');
			replaceState(u, {});
		}
		if (!s.identity.chosen) setTimeout(() => (ed.nameOpen = true), isNew ? 900 : 400);
	});
	onDestroy(() => s.destroy());

	// keep the recents title fresh
	let titleTimer: ReturnType<typeof setTimeout>;
	$effect(() => {
		const t = s.view.title;
		if (!s.loaded) return;
		clearTimeout(titleTimer);
		titleTimer = setTimeout(() => updateRecent(treeId, { title: t }), 800);
	});

	// toast other people's additions and deletions (the live region announces them too)
	$effect(() => {
		const a = s.announcement;
		if (a) toast.show(a);
	});

	function onEditRotated(next: string) {
		updateRecent(treeId, { token: next });
		s.switchToken(next);
		replaceState('/e/' + next, {});
	}

	async function savedLink() {
		isNew = false;
		updateRecent(treeId, { unsaved: false });
	}
	async function copyEditLink() {
		if (await copyText(`${location.origin}/e/${s.token}`)) toast.show('Copied the edit link. Keep it somewhere safe.');
		else ed.shareOpen = true;
	}

	async function makeCopy() {
		copying = true;
		try {
			const data = exportData(s.view, s.collapsed);
			const r = await createTreeRequest({ source: 'import', tree: { ...data, title: data.title } });
			goto('/e/' + r.editToken + '?new=1');
		} catch (e) {
			toast.show((e as Error).message);
		} finally {
			copying = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		const modOn = e.ctrlKey || e.metaKey;
		const t = e.target as HTMLElement;
		if (moreOpen && e.key === 'Escape') {
			moreOpen = false;
			return;
		}
		const inModal = !!t.closest?.('dialog');
		if (inModal) return;
		const k = e.key.toLowerCase();
		if (modOn && k === 'k') {
			e.preventDefault();
			ed.findOpen = true;
			return;
		}
		if (modOn && k === 'z' && !e.shiftKey) {
			e.preventDefault();
			ed.undo();
			return;
		}
		if (modOn && ((k === 'z' && e.shiftKey) || k === 'y')) {
			e.preventDefault();
			ed.redo();
			return;
		}
		if (k === 'escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && s.selectedKey) {
			ed.select(null);
			ed.sheetOpen = false;
		}
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{title} · Values Tree</title></svelte:head>

<div class="app" class:sheet-open={ed.sheetOpen} class:doc-mode={ed.mode === 'doc'}>
	<header class="bar">
		<a href="/" class="mark" aria-label="Values Tree home" title="All your trees">
			<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16h5" /><path d="M12 16c4 0 4-7 9-7" /><path d="M12 16c4 0 4 7 9 7" /></g><circle cx="7" cy="16" r="3.2" fill="currentColor" /><circle cx="23" cy="9" r="2.6" fill="currentColor" /><circle cx="23" cy="23" r="2.6" fill="currentColor" /></svg>
		</a>
		<div class="doc-title">
			{#if s.loaded}
				<input
					aria-label="Title of your values document"
					autocomplete="off"
					placeholder="Our Family Values"
					use:bindText={{ text: ed.metaText('title'), readonly: !ed.canEdit }}
					onkeydown={(e) => {
						if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
					}}
				/>
			{:else}
				<span class="title-ph">{title}</span>
			{/if}
		</div>

		<div class="tabs" role="tablist" aria-label="View">
			<button type="button" role="tab" aria-selected={ed.mode === 'tree'} onclick={() => {
				ed.mode = 'tree';
				if (s.selectedKey) ed.focusCard(s.selectedKey);
			}}><Icon name="tree" size={16} /> Tree</button>
			<button type="button" role="tab" aria-selected={ed.mode === 'doc'} onclick={() => (ed.mode = 'doc')}><Icon name="doc" size={16} /> Document</button>
		</div>

		<div class="tools">
			{#if ed.canEdit}
				<button type="button" class="icon-btn" disabled={!s.canUndo} aria-label="Undo" title="Undo ({mod}+Z)" onclick={() => ed.undo()}><Icon name="undo" /></button>
				<button type="button" class="icon-btn" disabled={!s.canRedo} aria-label="Redo" title="Redo ({mod}+Shift+Z)" onclick={() => ed.redo()}><Icon name="redo" /></button>
				<span class="divider" aria-hidden="true"></span>
			{/if}
			<ConnectionBadge {s} />
			<Presence {s} onme={() => (ed.nameOpen = true)} />
			<span class="divider" aria-hidden="true"></span>
			<div class="secondary">
				<button type="button" class="icon-btn" aria-label="Find a value" title="Find a value ({mod}+K)" onclick={() => (ed.findOpen = true)}><Icon name="search" /></button>
				<button type="button" class="icon-btn" aria-label="Export" title="Export JSON or Markdown" onclick={() => (ed.exportOpen = true)}><Icon name="download" /></button>
				{#if ed.canEdit}
					<button type="button" class="icon-btn" aria-label="Import" title="Import a tree file" onclick={() => (ed.importOpen = true)}><Icon name="upload" /></button>
					<button type="button" class="icon-btn" aria-label="Version history" title="Version history" onclick={() => (ed.historyOpen = true)}><Icon name="history" /></button>
				{/if}
				<button type="button" class="icon-btn" aria-label={theme.effective === 'dark' ? 'Use light theme' : 'Use dark theme'} title="Switch theme" onclick={() => theme.toggle()}>
					<Icon name={theme.effective === 'dark' ? 'sun' : 'moon'} />
				</button>
			</div>
			<div class="more-wrap">
				<button type="button" class="icon-btn" aria-label="More actions" aria-expanded={moreOpen} aria-controls="more-menu" onclick={() => (moreOpen = !moreOpen)}><Icon name="more" stroke={3} /></button>
				{#if moreOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
					<div class="menu-scrim" onclick={() => (moreOpen = false)}></div>
					<div class="menu" id="more-menu" role="menu">
						<button type="button" role="menuitem" onclick={() => { moreOpen = false; ed.findOpen = true; }}><Icon name="search" /> Find a value</button>
						<button type="button" role="menuitem" onclick={() => { moreOpen = false; ed.exportOpen = true; }}><Icon name="download" /> Export</button>
						{#if ed.canEdit}<button type="button" role="menuitem" onclick={() => { moreOpen = false; ed.importOpen = true; }}><Icon name="upload" /> Import</button>
						<button type="button" role="menuitem" onclick={() => { moreOpen = false; ed.historyOpen = true; }}><Icon name="history" /> Version history</button>{/if}
						<button type="button" role="menuitem" onclick={() => { moreOpen = false; theme.toggle(); }}><Icon name={theme.effective === 'dark' ? 'sun' : 'moon'} /> {theme.effective === 'dark' ? 'Light theme' : 'Dark theme'}</button>
					</div>
				{/if}
			</div>
		</div>
		<button type="button" class="btn primary share" onclick={() => (ed.shareOpen = true)}><Icon name="share" /> Share</button>
		<span class="row-break" aria-hidden="true"></span>
	</header>

	{#if s.conn === 'revoked' || s.conn === 'unknown'}
		<div class="banner bad" role="alert">
			<p>
				<strong>This link no longer works.</strong>
				{s.conn === 'revoked' ? 'Someone made a new link for this tree, which signs out the old one.' : 'It may have been replaced with a new link.'}
				Ask whoever shared it for the new link. {s.role === 'edit' ? 'Anything you changed here is still in your browser; export it so it isn’t lost.' : ''}
			</p>
			{#if s.role === 'edit'}<button type="button" class="btn small" onclick={() => (ed.exportOpen = true)}>Export a copy</button>{/if}
		</div>
	{:else if role === 'view'}
		<div class="banner">
			<p><Icon name="eye" size={16} /> <span>You’re viewing. Changes made by people with the edit link appear here as they happen.</span></p>
			<button type="button" class="btn small" disabled={copying} onclick={makeCopy}>Make my own copy</button>
		</div>
	{:else if isNew}
		<div class="banner accent">
			<p><strong>Save your edit link.</strong> There are no accounts here, so this link is the only way back to your tree. Bookmark it or keep it in a password manager.</p>
			<div class="row">
				<button type="button" class="btn small" onclick={copyEditLink}><Icon name="copy" /> Copy edit link</button>
				<button type="button" class="btn small quiet" onclick={savedLink}>I’ve saved it</button>
			</div>
		</div>
	{/if}
	{#if s.conn === 'offline' && role === 'edit' && s.loaded}
		<div class="banner quiet" role="status">
			<p><Icon name="offline" size={16} /> <span>You’re offline. Keep going; your changes are saved on this device and will sync when you reconnect.</span></p>
		</div>
	{/if}

	<main class="work">
		<section class="stage" aria-label={ed.mode === 'tree' ? 'Tree' : 'Document'}>
			{#if !s.loaded}
				<div class="loading" role="status">
					{#if s.conn === 'unknown' || s.conn === 'revoked'}
						<p>This tree couldn’t be opened.</p>
					{:else if s.conn === 'offline' || s.conn === 'reconnecting'}
						<p>Can’t reach the server, and this tree hasn’t been opened on this device before. It will appear as soon as the connection is back.</p>
					{:else}
						<p>Opening the tree…</p>
					{/if}
				</div>
			{:else if ed.mode === 'tree'}
				<TreeCanvas />
			{:else}
				<DocView />
			{/if}
		</section>
		<aside class="panel" aria-label="Details">
			<div class="sheet-handle" aria-hidden="true"></div>
			{#if s.loaded}<Panel />{/if}
		</aside>
	</main>
	{#if !ed.sheetOpen && s.loaded}
		<button type="button" class="btn details-btn" onclick={() => (ed.sheetOpen = true)}>{s.selected ? 'Details' : 'About this tree'}</button>
	{/if}
</div>

<div class="sr-only" aria-live="polite">{s.announcement}</div>

<ShareDialog bind:viewToken {onEditRotated} />
<ExportDialog />
{#if ed.canEdit}<ImportDialog /><HistoryDialog />{/if}
<DeleteDialog />
<QuickFind />
<NameDialog />

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		overflow: hidden;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 10px 14px;
		padding: 10px 16px 10px 14px;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
		flex-wrap: wrap;
		position: relative;
		z-index: 5;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		color: var(--accent);
		flex: none;
	}
	.mark:hover {
		background: var(--paper-2);
	}
	.doc-title {
		flex: 1 1 220px;
		min-width: 0;
	}
	.doc-title input,
	.title-ph {
		display: block;
		width: 100%;
		max-width: 520px;
		font-family: var(--font-display);
		font-variation-settings: 'opsz' 48;
		font-size: var(--t-xl);
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.2;
		border: 1px solid transparent;
		border-radius: var(--r-sm);
		background: transparent;
		padding: 3px 8px;
		margin-left: -8px;
		text-overflow: ellipsis;
	}
	.doc-title input:hover:not([readonly]) {
		border-color: var(--line);
	}
	.doc-title input:focus {
		outline: none;
		border-color: var(--accent);
		background: var(--paper);
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 999px;
		background: var(--paper-2);
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 0;
		background: transparent;
		border-radius: 999px;
		padding: 5px 14px 5px 11px;
		min-height: 32px;
		font-size: var(--t-sm);
		font-weight: 550;
		color: var(--muted);
	}
	.tabs button[aria-selected='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.divider {
		width: 1px;
		height: 22px;
		background: var(--line);
		margin: 0 6px;
	}
	.share {
		margin-left: 6px;
	}
	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		padding: 9px 18px;
		background: var(--paper-2);
		border-bottom: 1px solid var(--line);
		font-size: var(--t-sm);
	}
	.banner p {
		flex: 1 1 320px;
		display: flex;
		align-items: center;
		gap: 4px 8px;
		flex-wrap: wrap;
	}
	.banner.accent {
		background: var(--accent-soft);
	}
	.banner.bad {
		background: var(--danger-soft);
	}
	.banner .row {
		display: flex;
		gap: 6px;
	}
	.work {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 390px;
	}
	.stage {
		position: relative;
		min-width: 0;
		min-height: 0;
	}
	.panel {
		border-left: 1px solid var(--line);
		background: var(--surface);
		overflow: auto;
		overscroll-behavior: contain;
	}
	.sheet-handle,
	.details-btn {
		display: none;
	}
	.loading {
		display: grid;
		place-items: center;
		height: 100%;
		color: var(--muted);
		padding: 24px;
		text-align: center;
	}
	.loading p {
		max-width: 46ch;
	}

	@media (max-width: 1100px) {
		.work {
			grid-template-columns: minmax(0, 1fr) 340px;
		}
		.tools :global(.badge .text) {
			display: none;
		}
	}
	.row-break {
		display: none;
	}
	.secondary {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.more-wrap {
		display: none;
		position: relative;
	}
	.menu-scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 6px);
		z-index: 31;
		display: flex;
		flex-direction: column;
		min-width: 200px;
		padding: 6px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--r);
		box-shadow: var(--shadow-lift);
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 8px 12px;
		border: 0;
		background: none;
		border-radius: var(--r-sm);
		text-align: left;
		font-weight: 500;
	}
	.menu button:hover {
		background: var(--paper-2);
	}
	@media (max-width: 860px) {
		.bar {
			padding: 8px 10px;
			gap: 6px 8px;
		}
		.mark {
			order: 0;
		}
		.doc-title {
			order: 1;
			flex: 1 1 0;
		}
		.share {
			order: 2;
			margin-left: 0;
		}
		.row-break {
			display: block;
			order: 3;
			flex-basis: 100%;
			height: 0;
		}
		.tabs {
			order: 4;
		}
		.tools {
			order: 5;
			margin-left: auto;
			gap: 0;
		}
		.tabs button {
			padding: 5px 12px;
		}
		.tabs button :global(svg) {
			display: none;
		}
		.tools {
			grid-area: tools;
			justify-self: end;
			gap: 0;
		}
		.tools .divider,
		.secondary {
			display: none;
		}
		.more-wrap {
			display: block;
		}
		.tools :global(.icon-btn) {
			width: 40px;
		}
		.doc-title input,
		.title-ph {
			font-size: var(--t-lg);
		}
		.work {
			grid-template-columns: 1fr;
			position: relative;
		}
		.panel {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			max-height: 62dvh;
			border-left: 0;
			border-top: 1px solid var(--line);
			border-radius: var(--r-lg) var(--r-lg) 0 0;
			box-shadow: 0 -10px 30px rgb(0 0 0 / 0.16);
			transform: translateY(105%);
			transition: transform 0.24s var(--ease);
			z-index: 20;
			padding-bottom: env(safe-area-inset-bottom);
		}
		.sheet-open .panel {
			transform: none;
		}
		.sheet-handle {
			display: block;
			width: 40px;
			height: 4px;
			border-radius: 2px;
			background: var(--line-strong);
			margin: 8px auto 0;
		}
		.details-btn {
			display: inline-flex;
			position: fixed;
			left: 12px;
			bottom: calc(12px + env(safe-area-inset-bottom));
			z-index: 10;
			box-shadow: var(--shadow-lift);
		}
		.doc-mode .details-btn {
			display: none;
		}
	}
	@media print {
		.bar,
		.banner,
		.panel,
		.details-btn {
			display: none !important;
		}
		.app {
			height: auto;
			overflow: visible;
			display: block;
		}
		.work {
			display: block;
		}
	}
</style>
