<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	let { data } = $props();
</script>

<svelte:head><title>{data.title || 'Values tree'} · Values Tree</title></svelte:head>

<!-- The tree arrives over the WebSocket, so the editor only runs in the browser. -->
{#if browser}
{#key data.treeId}
	<Editor treeId={data.treeId} role="edit" token={page.params.token!} initialTitle={data.title} viewToken={data.viewToken} />
{/key}
{:else}
	<p class="ssr-loading">Opening the tree…</p>
{/if}

<style>
	.ssr-loading {
		padding: 40vh 24px 0;
		text-align: center;
		color: var(--muted);
	}
</style>
