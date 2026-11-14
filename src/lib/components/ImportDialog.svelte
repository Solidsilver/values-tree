<script lang="ts">
	import { goto } from '$app/navigation';
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { parseImport } from '$lib/model/io.ts';
	import { createTreeRequest, readFile } from '$lib/client/files.ts';
	import Modal from './Modal.svelte';

	const ed = useEditor();
	let raw = $state('');
	let error = $state('');
	let busy = $state(false);
	let dragging = $state(false);

	async function takeFile(f: File | undefined) {
		if (!f) return;
		try {
			raw = await readFile(f);
			error = '';
		} catch {
			error = 'That file couldn’t be read. Try pasting its contents instead.';
		}
	}

	function parse() {
		const r = parseImport(raw);
		if (!r.ok) error = r.error;
		return r.ok ? r.tree : null;
	}

	function replace() {
		const tree = parse();
		if (!tree) return;
		if (!ed.replaceAll(tree, `Imported ${Object.keys(tree.nodes).length} values. Undo brings back the old tree.`)) return;
		ed.importOpen = false;
		raw = '';
	}

	async function asNew() {
		const tree = parse();
		if (!tree) return;
		busy = true;
		try {
			const r = await createTreeRequest({ source: 'import', tree: { ...tree, nodes: Object.values(tree.nodes) } });
			ed.importOpen = false;
			goto('/e/' + r.editToken + '?new=1');
		} catch (e) {
			error = (e as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open={ed.importOpen} title="Import a tree" size="lg" onclose={() => (error = '')}>
	<p>Choose a tree file you exported earlier, or paste its contents. You can replace this tree (undo is available) or open it as a separate new tree.</p>
	<label
		class="drop"
		class:dragging
		ondragover={(e) => {
			e.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(e) => {
			e.preventDefault();
			dragging = false;
			takeFile(e.dataTransfer?.files[0]);
		}}
	>
		<input type="file" accept=".json,application/json,text/plain" onchange={(e) => takeFile(e.currentTarget.files?.[0])} />
		<span><strong>Choose a tree file</strong> or drop it here</span>
	</label>
	<div class="field">
		<label for="import-text">Or paste the JSON</label>
		<textarea id="import-text" bind:value={raw} rows="6" placeholder={'{ "format": "family-values-tree", ... }'}></textarea>
	</div>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#snippet actions()}
		<button type="button" class="btn" disabled={busy} onclick={asNew}>Open as a new tree</button>
		<button type="button" class="btn primary" disabled={busy} onclick={replace}>Replace this tree</button>
	{/snippet}
</Modal>

<style>
	.drop {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 88px;
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--r);
		color: var(--muted);
		text-align: center;
		padding: 14px;
		cursor: pointer;
	}
	.drop strong {
		color: var(--accent);
	}
	.drop.dragging,
	.drop:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.drop:focus-within {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	textarea {
		font: 12.5px/1.45 var(--font-mono) !important;
	}
	.error {
		color: var(--danger) !important;
		font-size: var(--t-sm);
	}
</style>
