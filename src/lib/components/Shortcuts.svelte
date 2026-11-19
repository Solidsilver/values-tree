<script lang="ts">
	let { editable = true }: { editable?: boolean } = $props();
	const mod = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.platform) ? '⌘' : 'Ctrl';
</script>

<details class="keys">
	<summary>Tips and keyboard shortcuts</summary>
	{#if editable}
		<p>Drag a value onto another to move it underneath. Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) while you drop to connect it there too, keeping it where it is. Select a value, then:</p>
	{:else}
		<p>Select a value, then:</p>
	{/if}
	<table>
		<tbody>
			<tr><td><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd></td><td>Move between values</td></tr>
			{#if editable}
				<tr><td><kbd>Enter</kbd></td><td>Rename it on the card (Enter again to finish)</td></tr>
				<tr><td><kbd>C</kbd></td><td>Add a value under it</td></tr>
				<tr><td><kbd>N</kbd></td><td>Add a sibling</td></tr>
				<tr><td><kbd>Alt</kbd> <kbd>↑</kbd>/<kbd>↓</kbd></td><td>Reorder among siblings</td></tr>
				<tr><td><kbd>Delete</kbd></td><td>Delete it</td></tr>
				<tr><td><kbd>{mod}</kbd> <kbd>Z</kbd></td><td>Undo your last change</td></tr>
				<tr><td><kbd>{mod}</kbd> <kbd>Shift</kbd> <kbd>Z</kbd></td><td>Redo</td></tr>
			{/if}
			<tr><td><kbd>{mod}</kbd> <kbd>K</kbd></td><td>Find a value by name</td></tr>
			<tr><td><kbd>Esc</kbd></td><td>Clear the selection</td></tr>
			<tr><td><kbd>{mod}</kbd> + scroll</td><td>Zoom the tree</td></tr>
		</tbody>
	</table>
</details>

<style>
	.keys {
		font-size: var(--t-sm);
		color: var(--muted);
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}
	summary {
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink);
		font-weight: 600;
		min-height: 28px;
		transition: color 0.14s var(--ease);
	}
	summary:hover {
		color: var(--accent);
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::before {
		content: '';
		width: 6.5px;
		height: 6.5px;
		border-right: 1.6px solid var(--muted);
		border-bottom: 1.6px solid var(--muted);
		transform: rotate(-45deg);
		transition: transform 0.15s var(--ease);
		margin: 0 3px 0 1px;
		flex: none;
	}
	.keys[open] summary::before {
		transform: rotate(45deg);
	}
	p {
		margin: 10px 0;
		line-height: 1.5;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	td {
		padding: 5px 12px 5px 0;
		vertical-align: top;
	}
	td:first-child {
		white-space: nowrap;
	}
</style>
