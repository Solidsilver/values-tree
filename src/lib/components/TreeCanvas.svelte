<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { useEditor } from '$lib/client/editor.svelte.ts';
	import Branch from './Branch.svelte';
	import Icon from './Icon.svelte';

	const ed = useEditor();
	const s = ed.s;

	let viewport: HTMLDivElement | undefined = $state();
	let world: HTMLDivElement | undefined = $state();
	let forest: HTMLDivElement | undefined = $state();

	// camera
	let tx = $state(0);
	let ty = $state(0);
	let z = $state(1);
	const MIN = 0.3;
	const MAX = 1.8;
	let placed = false;
	let entered = $state(false);

	type Path = { d: string; w: number; root: number; key: string };
	let paths = $state.raw<Path[]>([]);
	let size = $state({ w: 0, h: 0 });

	const reduceMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	/* ---------- connectors ---------- */
	function measure() {
		if (!world || !forest) return;
		const wr = world.getBoundingClientRect();
		const boxes = new Map<string, { l: number; r: number; y: number; root: number }>();
		for (const el of forest.querySelectorAll<HTMLElement>('.card[data-key]')) {
			const b = el.getBoundingClientRect();
			boxes.set(el.dataset.key!, {
				l: (b.left - wr.left) / z,
				r: (b.right - wr.left) / z,
				y: (b.top + b.height / 2 - wr.top) / z,
				root: Number(el.dataset.root || 0)
			});
		}
		const out: Path[] = [];
		for (const [key, c] of boxes) {
			const i = key.lastIndexOf('/');
			if (i < 0) continue;
			const pk = key.slice(0, i);
			const p = boxes.get(pk);
			if (!p) continue;
			const depth = pk.split('/').length - 1;
			const x1 = p.r + (s.view.nodes[pk.slice(pk.lastIndexOf('/') + 1)]?.children.length ? 13 : 0);
			const x2 = c.l;
			const dx = Math.max(18, (x2 - x1) * 0.55);
			out.push({
				d: `M${x1.toFixed(1)} ${p.y.toFixed(1)} C${(x1 + dx).toFixed(1)} ${p.y.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${c.y.toFixed(1)}, ${x2.toFixed(1)} ${c.y.toFixed(1)}`,
				w: Math.max(1.25, 2.8 - depth * 0.5),
				root: c.root,
				key
			});
		}
		paths = out;
		size = { w: forest.offsetWidth, h: forest.offsetHeight };
	}

	let raf = 0;
	function scheduleMeasure() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(measure);
	}

	$effect(() => {
		// re-measure whenever structure, folds or text change
		void s.view;
		void s.collapsed.size;
		void ed.inlineKey;
		void s.peers;
		tick().then(scheduleMeasure);
	});

	onMount(() => {
		const ro = new ResizeObserver(() => scheduleMeasure());
		if (forest) ro.observe(forest);
		// card text can change size once the web fonts arrive
		document.fonts?.ready.then(scheduleMeasure);
		const vro = new ResizeObserver(() => clamp());
		if (viewport) vro.observe(viewport);
		ed.reveal = reveal;
		return () => {
			ro.disconnect();
			vro.disconnect();
			cancelAnimationFrame(raf);
			ed.reveal = () => {};
		};
	});

	/* ---------- camera ---------- */
	function contentSize() {
		return { w: forest?.offsetWidth ?? 0, h: forest?.offsetHeight ?? 0 };
	}

	/** Keep at least part of the tree on screen. */
	function clamp() {
		if (!viewport) return;
		const { w, h } = contentSize();
		const vw = viewport.clientWidth;
		const vh = viewport.clientHeight;
		const minX = Math.min(40, vw - w * z - 40) - Math.max(0, w * z - 160);
		tx = Math.min(Math.max(tx, -(w * z) + 160), vw - 120);
		ty = Math.min(Math.max(ty, -(h * z) + 120), vh - 80);
		void minX;
	}

	function zoomAt(next: number, cx: number, cy: number) {
		next = Math.min(MAX, Math.max(MIN, next));
		const wx = (cx - tx) / z;
		const wy = (cy - ty) / z;
		z = next;
		tx = cx - wx * z;
		ty = cy - wy * z;
		clamp();
	}
	function zoomBy(f: number) {
		if (!viewport) return;
		zoomAt(Math.round(z * f * 20) / 20, viewport.clientWidth / 2, viewport.clientHeight / 2);
	}

	let anim = 0;
	function animateTo(nx: number, ny: number, nz = z, smooth = true) {
		cancelAnimationFrame(anim);
		if (!smooth || reduceMotion()) {
			tx = nx;
			ty = ny;
			z = nz;
			return;
		}
		const sx = tx, sy = ty, sz = z;
		const t0 = performance.now();
		const dur = 280;
		const step = (t: number) => {
			const k = Math.min(1, (t - t0) / dur);
			const e = 1 - Math.pow(1 - k, 3);
			tx = sx + (nx - sx) * e;
			ty = sy + (ny - sy) * e;
			z = sz + (nz - sz) * e;
			if (k < 1) anim = requestAnimationFrame(step);
		};
		anim = requestAnimationFrame(step);
	}

	function fit(smooth = true) {
		if (!viewport) return;
		const { w, h } = contentSize();
		if (!w || !h) return;
		const vw = viewport.clientWidth;
		const vh = viewport.clientHeight;
		const pad = vw < 600 ? 16 : 40;
		const nz = Math.min(1, Math.max(MIN, Math.min((vw - pad * 2) / w, (vh - pad * 2) / h)));
		const nx = Math.max(pad, (vw - w * nz) / 2);
		const ny = Math.max(pad, (vh - h * nz) / 2);
		animateTo(nx, ny, nz, smooth);
	}

	/** Bring a card into view if it is not comfortably visible. */
	function reveal(key: string, smooth = true) {
		if (!viewport) return;
		const el = viewport.querySelector<HTMLElement>(`.card[data-key="${CSS.escape(key)}"]`);
		if (!el) return;
		const vr = viewport.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		const m = 48;
		let dx = 0;
		let dy = 0;
		if (r.left < vr.left + m) dx = vr.left + m - r.left;
		else if (r.right > vr.right - m) dx = Math.max(vr.right - m - r.right, vr.left + m - r.left);
		if (r.top < vr.top + m) dy = vr.top + m - r.top;
		else if (r.bottom > vr.bottom - m) dy = vr.bottom - m - r.bottom;
		if (dx || dy) animateTo(tx + dx, ty + dy, z, smooth);
	}

	// first placement once the tree has arrived
	$effect(() => {
		if (placed || !s.loaded || !viewport) return;
		void s.view;
		tick().then(() => {
			if (placed || !viewport || !forest) return;
			placed = true;
			const { w, h } = contentSize();
			const vw = viewport.clientWidth;
			const vh = viewport.clientHeight;
			const pad = vw < 600 ? 16 : 48;
			if (w + pad * 2 > vw || h + pad * 2 > vh) {
				// Large trees: zoom out only as far as stays readable, then start at the top left.
				const fitZ = Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
				z = Math.min(1, Math.max(vw < 600 ? 0.7 : 0.8, fitZ));
				tx = w * z + pad * 2 <= vw ? (vw - w * z) / 2 : pad;
				ty = h * z + pad * 2 <= vh ? (vh - h * z) / 2 : pad;
				// keep the first root in view: it sits halfway down its branch
				const first = forest.querySelector<HTMLElement>('.card[data-key]');
				if (first && h * z + pad * 2 > vh) {
					const fr = forest.getBoundingClientRect();
					const cr = first.getBoundingClientRect();
					const cy = (cr.top + cr.height / 2 - fr.top) / (fr.height / h);
					ty = Math.min(pad, Math.max(vh - h * z - pad, vh * 0.42 - cy * z));
				}
			} else {
				tx = pad;
				ty = Math.max(pad, (vh - h) / 2.4);
			}
			if (s.selectedKey) reveal(s.selectedKey, false);
			entered = true;
		});
	});

	/* ---------- pointer: pan, pinch ---------- */
	const pointers = new Map<number, { x: number; y: number }>();
	let panning = $state(false);
	let pinchStart: { d: number; z: number; cx: number; cy: number } | null = null;
	let moved = 0;

	function isBackground(t: EventTarget | null) {
		return t instanceof Element && !t.closest('.card, button, input, textarea, a, .zoom');
	}

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0 && e.pointerType === 'mouse') return;
		const bg = isBackground(e.target);
		if (!bg && e.pointerType === 'mouse') return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (bg || pointers.size > 1) viewport!.setPointerCapture(e.pointerId);
		if (pointers.size === 1) {
			moved = 0;
			panning = bg || e.pointerType !== 'mouse';
		} else if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const r = viewport!.getBoundingClientRect();
			pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), z, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
			panning = true;
		}
	}
	function onpointermove(e: PointerEvent) {
		const p = pointers.get(e.pointerId);
		if (!p) return;
		const dx = e.clientX - p.x;
		const dy = e.clientY - p.y;
		p.x = e.clientX;
		p.y = e.clientY;
		if (pointers.size >= 2 && pinchStart) {
			const [a, b] = [...pointers.values()];
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			zoomAt(pinchStart.z * (d / pinchStart.d), pinchStart.cx, pinchStart.cy);
			tx += dx / 2;
			ty += dy / 2;
			return;
		}
		if (!panning) return;
		moved += Math.abs(dx) + Math.abs(dy);
		cancelAnimationFrame(anim);
		tx += dx;
		ty += dy;
	}
	function onpointerup(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchStart = null;
		if (pointers.size === 0) {
			const wasPan = panning;
			panning = false;
			clamp();
			// a click (not a drag) on empty canvas clears the selection
			if (wasPan && moved < 4 && isBackground(e.target) && !ed.inlineKey) ed.select(null);
		}
	}

	function onwheel(e: WheelEvent) {
		e.preventDefault();
		const r = viewport!.getBoundingClientRect();
		if (e.ctrlKey || e.metaKey) {
			const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
			zoomAt(z * f, e.clientX - r.left, e.clientY - r.top);
		} else {
			cancelAnimationFrame(anim);
			const k = e.deltaMode === 1 ? 16 : 1;
			tx -= e.deltaX * k;
			ty -= e.deltaY * k;
			clamp();
		}
	}

	/* root drop zone: drop a card here to make it a root value */
	let rootDrop = $state(false);
	const canRootDrop = $derived.by(() => {
		const k = ed.dragKey;
		const p = k ? s.view.placements.get(k) : null;
		return !!p && p.depth > 0;
	});

	const pct = $derived(Math.round(z * 100));
</script>

<div
	class="viewport"
	class:panning
	bind:this={viewport}
	role="presentation"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	{onwheel}
>
	<div class="world" class:entered bind:this={world} style:transform="translate({tx}px, {ty}px) scale({z})">
		<svg class="links" width={size.w} height={size.h} aria-hidden="true">
			{#each paths as p (p.key)}
				<path d={p.d} stroke-width={p.w} style:stroke="var(--b{p.root + 1})" />
			{/each}
		</svg>
		<div class="forest" bind:this={forest} onanimationend={scheduleMeasure} role="tree" aria-label="Values tree" aria-multiselectable="false">
			{#each s.view.roots as r, i (r)}
				<Branch id={r} parentKey={null} parentId={null} depth={0} rootIdx={i} posinset={i + 1} setsize={s.view.roots.length} />
			{/each}
			{#if ed.canEdit && s.view.roots.length}
				{#if canRootDrop}
					<div
						class="root-drop"
						class:over={rootDrop}
						role="region"
						aria-label="Drop here to make it a root value"
						ondragover={(e) => {
							e.preventDefault();
							rootDrop = true;
						}}
						ondragleave={() => (rootDrop = false)}
						ondrop={(e) => {
							e.preventDefault();
							rootDrop = false;
							const k = ed.dragKey;
							ed.dragKey = null;
							if (k) ed.moveTo(k, null);
						}}
					>
						Drop here to make it a root value
					</div>
				{:else}
					<button type="button" class="add-root" onclick={() => ed.addRoot()}>
						<Icon name="plus" size={16} /> Add a root value
					</button>
				{/if}
			{/if}
		</div>
	</div>

	{#if s.loaded && !s.view.roots.length}
		<div class="empty">
			{#if ed.canEdit}
				<h2>Plant your first root value</h2>
				<p>Start with the few values everything else should grow from. You can add more specific values underneath each one as you go.</p>
				<button type="button" class="btn primary" onclick={() => ed.addRoot()}><Icon name="plus" /> Add a root value</button>
			{:else}
				<h2>Nothing here yet</h2>
				<p>This tree has no values yet. When someone with the edit link adds some, they will appear here as they type.</p>
			{/if}
		</div>
	{/if}

	<div class="zoom" role="toolbar" aria-label="Zoom">
		<button type="button" class="icon-btn small" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.2)}><Icon name="minus" /></button>
		<button type="button" class="pct" aria-label="Reset zoom to 100%" onclick={() => zoomBy(1 / z)}>{pct}%</button>
		<button type="button" class="icon-btn small" aria-label="Zoom in" onclick={() => zoomBy(1.2)}><Icon name="plus" /></button>
		<span class="sep" aria-hidden="true"></span>
		<button type="button" class="icon-btn small" aria-label="Fit the tree to the screen" title="Fit to screen" onclick={() => fit()}><Icon name="fit" /></button>
	</div>
</div>

<style>
	.viewport {
		position: relative;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
		background-color: var(--paper);
		background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--ink) calc(var(--grain) * 100%), transparent) 1px, transparent 0);
		background-size: 22px 22px;
	}
	.viewport.panning {
		cursor: grabbing;
	}
	.world {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
		will-change: transform;
		opacity: 0;
	}
	.world.entered {
		opacity: 1;
		transition: opacity 0.35s ease;
	}
	.links {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
		pointer-events: none;
	}
	.links path {
		fill: none;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.forest {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 40px;
		padding: 8px 40px 40px 8px;
		width: max-content;
	}
	.add-root,
	.root-drop {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		width: 268px;
		padding: 14px 18px;
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--r);
		background: transparent;
		color: var(--muted);
		font-weight: 520;
		text-align: left;
	}
	.add-root:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, transparent);
	}
	.root-drop {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
		justify-content: center;
	}
	.root-drop.over {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 14px;
		max-width: 460px;
		padding: 32px clamp(20px, 6vw, 72px);
		cursor: default;
	}
	.empty h2 {
		font-size: var(--t-2xl);
		line-height: 1.15;
	}
	.empty p {
		color: var(--ink-2);
	}
	.empty .btn {
		align-self: flex-start;
	}
	.zoom {
		position: absolute;
		left: 16px;
		bottom: 16px;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 999px;
		box-shadow: var(--shadow);
		cursor: default;
	}
	.pct {
		border: 0;
		background: none;
		min-width: 50px;
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		color: var(--muted);
		padding: 6px 2px;
		border-radius: 999px;
	}
	.pct:hover {
		color: var(--ink);
	}
	.sep {
		width: 1px;
		height: 18px;
		background: var(--line);
		margin: 0 2px;
	}
	@media (max-width: 860px) {
		.zoom {
			left: auto;
			right: 12px;
			bottom: 12px;
		}
	}
</style>
