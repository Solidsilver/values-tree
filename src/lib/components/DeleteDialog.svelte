<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { countBelow, deletionSet, titleOf } from '$lib/model/derive.ts';
	import Modal from './Modal.svelte';

	const ed = useEditor();
	const v = $derived(ed.s.view);
	const key = $derived(ed.deleteKey);
	const pl = $derived(key ? v.placements.get(key) : null);
	let open = $state(false);
	$effect(() => {
		open = !!pl;
	});

	const info = $derived.by(() => {
		if (!pl) return null;
		const id = pl.id;
		const below = countBelow(v, id);
		const gone = deletionSet(v, id).size - 1;
		const parents = v.parentsOf.get(id) || [];
		return {
			id,
			name: v.nodes[id].title || 'this untitled value',
			below,
			kept: below - gone,
			hereOnly: parents.length > 1 && !!pl.parentId,
			parents
		};
	});

	function act(what: 'all' | 'keep' | 'unlink') {
		const k = key;
		const p = pl;
		ed.deleteKey = null;
		open = false;
		if (!k || !p) return;
		if (what === 'all') ed.remove(k, false);
		else if (what === 'keep') ed.remove(k, true);
		else {
			ed.unlink(p.id, p.parentId!);
			ed.focusCard(ed.s.selectedKey);
		}
	}
	const them = (n: number, one: string, many: string) => (n === 1 ? one : many);
</script>

{#if info && pl}
	<Modal bind:open title="Delete “{info.name}”?" size="sm" onclose={() => (ed.deleteKey = null)}>
		{#if info.hereOnly}
			<p>“{info.name}” grows from {info.parents.length} values. You can remove it from “{titleOf(v, pl.parentId)}” only, or delete it everywhere.</p>
		{/if}
		{#if info.below}
			<p>
				{info.below} {them(info.below, 'value grows', 'values grow')} from it. You can delete {them(info.below, 'it', 'them')} too, or keep
				{them(info.below, 'it', 'them')} and move {them(info.below, 'it', 'them')} up a level.
				{#if info.kept > 0}{info.kept} {them(info.kept, 'of them also grows', 'of them also grow')} from other values, so {them(info.kept, 'it stays', 'they stay')} either way.{/if}
				You can undo this.
			</p>
		{:else}
			<p>You can undo this.</p>
		{/if}
		{#snippet actions()}
			<button type="button" class="btn" data-autofocus onclick={() => (open = false)}>Cancel</button>
			{#if info.hereOnly}<button type="button" class="btn" onclick={() => act('unlink')}>Remove from “{titleOf(v, pl.parentId)}” only</button>{/if}
			{#if info.below}<button type="button" class="btn" onclick={() => act('keep')}>Delete only this value</button>{/if}
			<button type="button" class="btn danger-fill" onclick={() => act('all')}>
				{info.below ? 'Delete it and everything under it' : info.hereOnly ? 'Delete everywhere' : 'Delete'}
			</button>
		{/snippet}
	</Modal>
{/if}
