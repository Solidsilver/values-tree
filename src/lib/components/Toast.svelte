<script lang="ts">
	import { toast } from '$lib/client/toast.svelte.ts';
</script>

<div class="toast" class:show={toast.visible} role="status" aria-live="polite">{toast.message}</div>

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(22px + env(safe-area-inset-bottom));
		transform: translate(-50%, 14px);
		opacity: 0;
		pointer-events: none;
		background: var(--ink);
		color: var(--paper);
		padding: 10px 18px;
		border-radius: 999px;
		font-size: var(--t-sm);
		font-weight: 500;
		max-width: calc(100% - 32px);
		text-align: center;
		transition:
			opacity 0.2s,
			transform 0.2s var(--ease);
		z-index: 100;
	}
	.toast.show {
		opacity: 1;
		transform: translate(-50%, 0);
	}
</style>
