<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { exportData, slug, toMarkdown } from '$lib/model/io.ts';
	import { copyText, download } from '$lib/client/files.ts';
	import { toast } from '$lib/client/toast.svelte.ts';
	import Modal from './Modal.svelte';
	import Icon from './Icon.svelte';

	const ed = useEditor();
	const s = ed.s;
	let fmt = $state<'json' | 'md'>('json');
	const text = $derived(fmt === 'json' ? JSON.stringify(exportData(s.view, s.collapsed), null, 2) : toMarkdown(s.view));
	const filename = $derived(slug(s.view.title) + (fmt === 'json' ? '.json' : '.md'));

	function save() {
		download(filename, text, fmt === 'json' ? 'application/json' : 'text/markdown');
		toast.show('Downloaded ' + filename);
	}
	async function copy() {
		if (await copyText(text)) toast.show('Copied to your clipboard');
		else toast.show('Your browser blocked the clipboard. Download the file instead.');
	}
</script>

<Modal bind:open={ed.exportOpen} title="Export your tree" size="lg">
	<p>
		The tree file holds everything, including values with more than one parent, so you can import it here later or keep it as a backup.
		The readable document is Markdown you can paste into a doc or an email.
	</p>
	<div class="seg" role="radiogroup" aria-label="Format">
		<button type="button" role="radio" aria-checked={fmt === 'json'} onclick={() => (fmt = 'json')}>Tree file (JSON)</button>
		<button type="button" role="radio" aria-checked={fmt === 'md'} onclick={() => (fmt = 'md')}>Readable document (Markdown)</button>
	</div>
	<label class="sr-only" for="export-text">Contents</label>
	<textarea id="export-text" readonly value={text}></textarea>
	{#snippet actions()}
		<button type="button" class="btn" onclick={copy}><Icon name="copy" /> Copy</button>
		<button type="button" class="btn primary" data-autofocus onclick={save}><Icon name="download" /> Download {filename}</button>
	{/snippet}
</Modal>

<style>
	.seg {
		display: inline-flex;
		align-self: flex-start;
		flex-wrap: wrap;
		gap: 2px;
		padding: 3px;
		border-radius: 999px;
		background: var(--paper-2);
	}
	.seg button {
		border: 0;
		background: transparent;
		border-radius: 999px;
		padding: 6px 14px;
		font-size: var(--t-sm);
		font-weight: 520;
		color: var(--muted);
		min-height: 32px;
	}
	.seg button[aria-checked='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow);
	}
	textarea {
		width: 100%;
		min-height: 240px;
		font: 12.5px/1.5 var(--font-mono);
		border: 1px solid var(--line);
		border-radius: var(--r-sm);
		padding: 10px 12px;
		background: var(--paper);
		resize: vertical;
		color: var(--ink-2);
	}
</style>
