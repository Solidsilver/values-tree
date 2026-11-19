<script lang="ts">
	import { page } from '$app/state';
	const invalid = $derived(page.error?.code === 'invalid-link' || page.status === 404);
</script>

<svelte:head><title>{invalid ? 'Link not found' : 'Something went wrong'} · Values Tree</title></svelte:head>

<div class="page">
	<main class="err">
		<a href="/" class="mark" aria-label="Values Tree home">
			<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 16h5" /><path d="M12 16c4 0 4-7 9-7" /><path d="M12 16c4 0 4 7 9 7" /></g><circle cx="7" cy="16" r="3.2" fill="currentColor" /><circle cx="23" cy="9" r="2.6" fill="currentColor" /><circle cx="23" cy="23" r="2.6" fill="currentColor" /></svg>
			Values Tree
		</a>
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
</div>

<style>
	.page {
		min-height: 100dvh;
		background-color: var(--paper);
		background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) calc(var(--grain) * 100%), transparent) 1px, transparent 0);
		background-size: 22px 22px;
	}
	.err {
		max-width: 560px;
		margin: 0 auto;
		padding: 12vh 24px 48px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.mark {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		align-self: flex-start;
		font-family: var(--font-display);
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--accent);
		text-decoration: none;
		margin-bottom: 24px;
	}
	h1 {
		font-size: clamp(32px, 5vw, var(--t-3xl));
		line-height: 1.06;
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
