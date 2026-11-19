<script lang="ts">
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import { initials, PRESENCE_COLORS, saveIdentity } from '$lib/client/presence.ts';
	import Modal from './Modal.svelte';

	const ed = useEditor();
	const s = ed.s;
	let name = $state(s.identity.chosen ? s.identity.name : '');
	let color = $state(s.identity.color);
	const previewInitials = $derived(initials(name.trim() || 'Guest'));

	function save(e?: Event) {
		e?.preventDefault();
		const id = { name: name.trim().slice(0, 40) || 'Guest', color, chosen: true };
		saveIdentity(id);
		s.setIdentity(id);
		ed.nameOpen = false;
	}
	function skip() {
		const id = { ...s.identity, chosen: true };
		saveIdentity(id);
		s.setIdentity(id);
		ed.nameOpen = false;
	}
</script>

<Modal bind:open={ed.nameOpen} title="What should others see?" size="sm">
	<p>Pick a name so the people working on this tree with you know who is who. It is kept on this device only.</p>
	<form class="name-row" onsubmit={save}>
		<span class="preview-av" style:background={color} aria-hidden="true">{previewInitials}</span>
		<div class="field grow">
			<label for="display-name">Your name</label>
			<input id="display-name" autocomplete="nickname" maxlength="40" placeholder="e.g. Sam" bind:value={name} data-autofocus />
		</div>
	</form>
	<fieldset class="colors">
		<legend class="field-label">Your colour</legend>
		<div class="swatches">
			{#each PRESENCE_COLORS as c (c)}
				<label class="sw" style:--c={c}>
					<input type="radio" name="color" value={c} bind:group={color} />
					<span class="sr-only">{c}</span>
				</label>
			{/each}
		</div>
	</fieldset>
	{#snippet actions()}
		<button type="button" class="btn quiet" onclick={skip}>Skip</button>
		<button type="button" class="btn primary" onclick={() => save()}>Save</button>
	{/snippet}
</Modal>

<style>
	.name-row {
		display: flex;
		align-items: flex-end;
		gap: 12px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.preview-av {
		flex: none;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		color: #fff;
		font-size: 14px;
		font-weight: 650;
		letter-spacing: 0.02em;
		transition: background-color 0.16s var(--ease);
	}
	.colors {
		border: 0;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.sw {
		position: relative;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--c);
		cursor: pointer;
		transition: transform 0.14s var(--ease);
	}
	.sw:hover {
		transform: scale(1.08);
	}
	.sw input {
		position: absolute;
		inset: 0;
		opacity: 0;
		margin: 0;
		cursor: pointer;
	}
	.sw:has(input:checked) {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--c);
	}
	.sw:has(input:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
	}
</style>
