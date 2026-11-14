<script lang="ts">
	import type { Session } from '$lib/client/session.svelte.ts';
	import { initials } from '$lib/client/presence.ts';
	let { s, onme }: { s: Session; onme: () => void } = $props();
	const shown = $derived(s.peers.slice(0, 5));
	const extra = $derived(Math.max(0, s.peers.length - 5));
	const summary = $derived(
		s.peers.length <= 1
			? 'Only you are here'
			: s.peers.map((p) => (p.self ? 'You' : p.name) + (p.role === 'view' ? ' (viewing)' : ' (editing)')).join(', ')
	);
</script>

<div class="presence" aria-label="People here: {summary}" role="group">
	{#each shown as p (p.clientId)}
		{#if p.self}
			<button type="button" class="av self" style:--c={p.color} title="You ({p.name}). Change your name" aria-label="You, {p.name}. Change your name" onclick={onme}>
				{initials(p.name)}
			</button>
		{:else}
			<span class="av" class:viewer={p.role === 'view'} style:--c={p.color} title="{p.name}, {p.role === 'view' ? 'viewing' : 'editing'}" aria-hidden="true">{initials(p.name)}</span>
		{/if}
	{/each}
	{#if extra}<span class="av more" title={summary}>+{extra}</span>{/if}
</div>

<style>
	.presence {
		display: flex;
		align-items: center;
		padding-left: 6px;
	}
	.av {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		margin-left: -6px;
		border-radius: 50%;
		border: 2px solid var(--surface);
		background: var(--c);
		color: #fff;
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.02em;
		padding: 0;
	}
	.av.viewer {
		background: var(--surface);
		color: var(--c);
		box-shadow: inset 0 0 0 2px var(--c);
	}
	.av.self {
		cursor: pointer;
	}
	.av.self:hover {
		transform: translateY(-1px);
	}
	.av.more {
		background: var(--paper-2);
		color: var(--ink-2);
	}
</style>
