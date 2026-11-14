<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { copyText } from '$lib/client/files.ts';
	import { toast } from '$lib/client/toast.svelte.ts';
	import Modal from './Modal.svelte';
	import Icon from './Icon.svelte';

	let { viewToken = $bindable(null), onEditRotated }: { viewToken?: string | null; onEditRotated: (t: string) => void } = $props();
	const ed = useEditor();
	const s = ed.s;
	const origin = typeof location !== 'undefined' ? location.origin : '';
	const editUrl = $derived(`${origin}/e/${s.token}`);
	const viewUrl = $derived(s.role === 'view' ? `${origin}/v/${s.token}` : viewToken ? `${origin}/v/${viewToken}` : '');

	let confirm = $state<null | 'edit' | 'view'>(null);
	let busy = $state(false);
	let error = $state('');
	let fresh = $state<null | 'edit' | 'view'>(null);

	async function copy(url: string, what: string) {
		if (await copyText(url)) toast.show(`Copied the ${what} link`);
		else toast.show('Your browser blocked the clipboard. Select the link and copy it.');
	}

	async function regenerate(which: 'edit' | 'view') {
		busy = true;
		error = '';
		try {
			const res = await fetch(`/api/trees/${s.token}/rotate`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ which })
			});
			if (!res.ok) throw new Error();
			const j = await res.json();
			viewToken = j.viewToken;
			if (which === 'edit') onEditRotated(j.editToken);
			fresh = which;
			confirm = null;
			toast.show(which === 'edit' ? 'New edit link made. The old one no longer works.' : 'New view link made. The old one no longer works.');
		} catch {
			error = 'That didn’t work. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open={ed.shareOpen} title="Share this tree" onclose={() => { confirm = null; fresh = null; error = ''; }}>
	{#if s.role === 'edit'}
		<p>Anyone with a link can open this tree. There are no accounts, so treat the edit link like a key.</p>
	{:else}
		<p>You have a view-only link. You can pass it on; anyone with it can read the tree but not change it.</p>
	{/if}

	{#if viewUrl}
		<div class="link" class:fresh={fresh === 'view'}>
			<div class="link-head">
				<Icon name="eye" />
				<div>
					<h3>View-only link</h3>
					<p>Can read the tree and see who is here. Cannot change anything.</p>
				</div>
			</div>
			<div class="copy-row">
				<input class="input" readonly value={viewUrl} aria-label="View-only link" onfocus={(e) => e.currentTarget.select()} />
				<button type="button" class="btn" data-autofocus={s.role === 'view' ? true : undefined} onclick={() => copy(viewUrl, 'view-only')}><Icon name="copy" /> Copy</button>
			</div>
			{#if s.role === 'edit'}
				{#if confirm === 'view'}
					<div class="confirm" role="alert">
						<p>Make a new view link? Everyone using the current one will be signed out of this tree straight away and will need the new link.</p>
						<div class="row">
							<button type="button" class="btn small" onclick={() => (confirm = null)}>Keep the current link</button>
							<button type="button" class="btn small danger-fill" disabled={busy} onclick={() => regenerate('view')}>Make a new view link</button>
						</div>
					</div>
				{:else}
					<button type="button" class="regen" onclick={() => (confirm = 'view')}>Regenerate view link…</button>
				{/if}
			{/if}
		</div>
	{:else if s.role === 'edit'}
		<div class="link">
			<p>The view-only link isn’t available on this copy. Make a new one to share read-only access.</p>
			<button type="button" class="btn small" disabled={busy} onclick={() => regenerate('view')}>Make a view-only link</button>
		</div>
	{/if}

	{#if s.role === 'edit'}
		<div class="link" class:fresh={fresh === 'edit'}>
			<div class="link-head">
				<Icon name="pencil" />
				<div>
					<h3>Edit link</h3>
					<p>Can change everything, share the tree, and make new links. Only give it to people you’d trust with the whole document.</p>
				</div>
			</div>
			<div class="copy-row">
				<input class="input" readonly value={editUrl} aria-label="Edit link" onfocus={(e) => e.currentTarget.select()} />
				<button type="button" class="btn" data-autofocus onclick={() => copy(editUrl, 'edit')}><Icon name="copy" /> Copy</button>
			</div>
			{#if confirm === 'edit'}
				<div class="confirm" role="alert">
					<p>Make a new edit link? Everyone else using the current one, on any device, will be signed out straight away. This browser switches to the new link. Save it somewhere safe; it is the only way back in.</p>
					<div class="row">
						<button type="button" class="btn small" onclick={() => (confirm = null)}>Keep the current link</button>
						<button type="button" class="btn small danger-fill" disabled={busy} onclick={() => regenerate('edit')}>Make a new edit link</button>
					</div>
				</div>
			{:else}
				<button type="button" class="regen" onclick={() => (confirm = 'edit')}>Regenerate edit link…</button>
			{/if}
		</div>
		<p class="note">Bookmark the edit link or keep it in a password manager. This site has no accounts, so the link is the only way back to this tree.</p>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</Modal>

<style>
	.link {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 0 4px;
		border-top: 1px solid var(--line);
	}
	.link.fresh .input {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.link-head {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.link-head :global(svg) {
		margin-top: 3px;
		color: var(--muted);
		flex: none;
	}
	h3 {
		font-size: var(--t-md);
		font-weight: 650;
	}
	.link-head p {
		font-size: var(--t-sm);
		color: var(--muted);
	}
	.copy-row {
		display: flex;
		gap: 8px;
	}
	.copy-row .input {
		flex: 1;
		min-width: 0;
		font: 13px/1.4 var(--font-mono);
		color: var(--ink-2);
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		padding: 8px 10px;
		background: var(--paper);
	}
	.regen {
		align-self: flex-start;
		border: 0;
		background: none;
		padding: 2px 0;
		font-size: var(--t-sm);
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--line-strong);
	}
	.regen:hover {
		color: var(--danger);
	}
	.confirm {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 14px;
		border-radius: var(--r-sm);
		background: var(--danger-soft);
	}
	.confirm p {
		font-size: var(--t-sm);
		color: var(--ink);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.note {
		font-size: var(--t-sm);
		color: var(--muted);
	}
	.error {
		color: var(--danger);
		font-size: var(--t-sm);
	}
</style>
