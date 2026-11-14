<script lang="ts">
	import { page } from '$app/state';
	const invalid = $derived(page.error?.code === 'invalid-link' || page.status === 404);
</script>

<svelte:head><title>{invalid ? 'Link not found' : 'Something went wrong'} · Values Tree</title></svelte:head>

<main class="err">
	<a href="/" class="mark" aria-label="Values Tree home">Values Tree</a>
	{#if invalid && page.url.pathname.match(/^\/(e|v)\//)}
		<h1>This link no longer works</h1>
		<p>Whoever shares this tree may have made a new link, which switches the old one off. Ask them for the current link.</p>
		<p>If you made this tree, check your bookmarks or password manager for the newest edit link.</p>
	{:else if invalid}
		<h1>Nothing here</h1>
		<p>That page doesn’t exist.</p>
	{:else}
		<h1>Something went wrong</h1>
		<p>{page.error?.message ?? 'An unexpected error.'} Try again in a moment.</p>
	{/if}
	<p><a class="btn primary" href="/">Go to the start page</a></p>
</main>

<style>
	.err {
		max-width: 560px;
		margin: 0 auto;
		padding: 12vh 24px 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.mark {
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		margin-bottom: 24px;
	}
	h1 {
		font-size: var(--t-3xl);
		line-height: 1.05;
	}
	p {
		color: var(--ink-2);
		font-size: var(--t-lg);
	}
	.btn {
		text-decoration: none;
		margin-top: 8px;
	}
</style>
