<script lang="ts">
	import type { Session } from '$lib/client/session.svelte.ts';
	let { s }: { s: Session } = $props();
	const state = $derived.by(() => {
		switch (s.conn) {
			case 'synced':
				return s.role === 'view'
					? { tone: 'ok', text: 'Live', title: 'Connected. Changes by others appear as they happen.' }
					: s.pending
						? { tone: 'busy', text: 'Syncing…', title: 'Sending your latest changes.' }
						: { tone: 'ok', text: 'Saved', title: 'Every change is saved and shared as you go.' };
			case 'connecting':
				return { tone: 'busy', text: 'Connecting…', title: 'Connecting to the server.' };
			case 'reconnecting':
				return { tone: 'warn', text: 'Reconnecting…', title: 'Lost the connection. Your changes are kept on this device and will sync when it is back.' };
			case 'offline':
				return { tone: 'warn', text: s.role === 'edit' ? 'Offline: changes saved on this device' : 'Offline', title: 'You are offline. Changes are kept on this device and will sync when you reconnect.' };
			case 'revoked':
				return { tone: 'bad', text: 'Link revoked', title: 'This link was replaced by a new one.' };
			case 'unknown':
				return { tone: 'bad', text: 'Link not valid', title: 'This link no longer works.' };
		}
	});
</script>

<span class="badge {state.tone}" title={state.title} role="status">
	<span class="dot" aria-hidden="true"></span><span class="text">{state.text}</span>
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 0 5px;
		font-size: var(--t-xs);
		font-weight: 520;
		color: var(--muted);
		white-space: nowrap;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
		flex: none;
	}
	.ok .dot {
		background: var(--b1);
	}
	.busy .dot {
		background: var(--b3);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.warn {
		color: var(--ink-2);
	}
	.warn .dot {
		background: var(--b3);
	}
	.bad {
		color: var(--danger);
	}
	.bad .dot {
		background: var(--danger);
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	@media (max-width: 700px) {
		.ok .text {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
		}
	}
</style>
