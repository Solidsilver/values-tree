<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { noteOf } from '$lib/model/derive.ts';

	let { id, parentId, label, placeholder, readonly = false }: { id: string; parentId: string; label: string; placeholder: string; readonly?: boolean } = $props();
	const ed = useEditor();
	const stored = $derived(noteOf(ed.s.view, id, parentId));
	let el: HTMLTextAreaElement | undefined = $state();
	let focused = false;
	const fid = $derived('note-' + id + '-' + parentId);

	// Notes are short, last-writer-wins strings; follow remote changes unless typing here.
	$effect(() => {
		const val = stored;
		if (el && !focused && el.value !== val) {
			el.value = val;
			grow();
		}
	});
	function grow() {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = el.scrollHeight + 2 + 'px';
	}
</script>

{#if readonly && !stored}
	<span class="none">No note yet.</span>
{:else}
	<label class="sr-only" for={fid}>{label}</label>
	<textarea
		bind:this={el}
		id={fid}
		class="note"
		rows="1"
		{readonly}
		{placeholder}
		onfocus={() => (focused = true)}
		onblur={() => {
			focused = false;
			if (el && el.value !== stored) el.value = stored;
		}}
		oninput={(e) => {
			grow();
			ed.setNote(id, parentId, e.currentTarget.value);
		}}
	></textarea>
{/if}

<style>
	.note {
		width: 100%;
		border: 1px solid color-mix(in srgb, var(--line) 80%, transparent);
		border-radius: var(--r-sm);
		padding: 6px 10px;
		background: var(--surface);
		font-family: var(--font-display);
		font-style: italic;
		font-size: 14.5px;
		line-height: 1.42;
		resize: none;
		overflow: hidden;
		min-height: 34px;
		transition:
			border-color 0.14s var(--ease),
			background-color 0.14s var(--ease),
			box-shadow 0.14s var(--ease);
	}
	.note:hover:not(:focus):not([readonly]) {
		border-color: var(--line-strong);
	}
	.note:focus {
		outline: none;
		border-color: var(--accent);
		background: var(--surface);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
		font-style: normal;
	}
	.note[readonly] {
		border-color: transparent;
		background: transparent;
		padding: 2px 0;
		min-height: 0;
	}
	.none {
		font-size: var(--t-sm);
		color: var(--muted);
		font-style: italic;
	}
</style>
