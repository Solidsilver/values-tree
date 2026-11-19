<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import Card from './Card.svelte';
	import Branch from './Branch.svelte';

	let {
		id,
		parentKey,
		parentId,
		depth,
		rootIdx,
		posinset,
		setsize
	}: {
		id: string;
		parentKey: string | null;
		parentId: string | null;
		depth: number;
		rootIdx: number;
		posinset: number;
		setsize: number;
	} = $props();

	const ed = useEditor();
	const s = ed.s;
	const key = $derived(parentKey ? parentKey + '/' + id : id);
	const kids = $derived(s.view.nodes[id]?.children ?? []);
	const open = $derived(kids.length > 0 && !s.collapsed.has(id));
</script>

{#if s.view.nodes[id]}
	<div class="branch" class:is-root={depth === 0} style:--hue={depth === 0 ? `var(--b${(rootIdx % 5) + 1})` : undefined}>
		<Card {id} {key} {parentId} {depth} {rootIdx} {posinset} {setsize} />
		{#if open}
			<div class="children" role="group">
				{#each kids as c, i (c)}
					<Branch id={c} parentKey={key} parentId={id} depth={depth + 1} {rootIdx} posinset={i + 1} setsize={kids.length} />
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.branch {
		display: flex;
		align-items: center;
	}
	.children {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-left: 64px;
		animation: grow 0.22s var(--ease);
	}
	.is-root > .children {
		padding-left: 76px;
	}
	@keyframes grow {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
	}
</style>
