<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		size = 'md',
		onclose,
		children,
		actions
	}: {
		open: boolean;
		title: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		onclose?: () => void;
		children: Snippet;
		actions?: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let returnFocus: Element | null = null;
	const id = 'm' + Math.random().toString(36).slice(2, 8);

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			returnFocus = document.activeElement;
			dialog.showModal();
			const auto = dialog.querySelector<HTMLElement>('[data-autofocus]');
			auto?.focus();
		} else if (!open && dialog.open) dialog.close();
	});

	function onDialogClose() {
		open = false;
		onclose?.();
		if (returnFocus instanceof HTMLElement && document.contains(returnFocus)) returnFocus.focus();
	}
</script>

<dialog
	bind:this={dialog}
	class="modal {size}"
	aria-labelledby={id}
	onclose={onDialogClose}
	onmousedown={(e) => {
		if (e.target === dialog) open = false;
	}}
>
	{#if open}
		<div class="inner">
			<header>
				<h2 {id}>{title}</h2>
				<button type="button" class="icon-btn small" aria-label="Close" onclick={() => (open = false)}>
					<Icon name="close" />
				</button>
			</header>
			<div class="body">{@render children()}</div>
			{#if actions}<footer>{@render actions()}</footer>{/if}
		</div>
	{/if}
</dialog>

<style>
	.modal {
		padding: 0;
		border: 1px solid var(--line);
		border-radius: var(--r-lg);
		background: var(--surface);
		color: var(--ink);
		width: min(520px, calc(100% - 24px));
		max-height: calc(100% - 32px);
		box-shadow: var(--shadow-lift);
	}
	.modal.sm {
		width: min(420px, calc(100% - 24px));
	}
	.modal.lg {
		width: min(680px, calc(100% - 24px));
	}
	.modal.xl {
		width: min(920px, calc(100% - 24px));
	}
	.modal[open] {
		animation: rise 0.18s var(--ease);
	}
	.modal::backdrop {
		background: var(--scrim);
		backdrop-filter: blur(3px);
	}
	.inner {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 22px 24px 22px;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		font-size: var(--t-xl);
		line-height: 1.2;
		padding-top: 3px;
	}
	header .icon-btn {
		margin: -4px -8px 0 0;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.body :global(p) {
		color: var(--ink-2);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
		padding-top: 4px;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.99);
		}
	}
	@media (max-width: 600px) {
		.modal {
			margin: auto auto 0;
			width: 100%;
			max-width: 100%;
			border-radius: var(--r-lg) var(--r-lg) 0 0;
			border-bottom: 0;
		}
		.inner {
			padding: 20px 18px calc(18px + env(safe-area-inset-bottom));
		}
		footer {
			flex-direction: column-reverse;
		}
		footer :global(.btn) {
			width: 100%;
		}
	}
</style>
