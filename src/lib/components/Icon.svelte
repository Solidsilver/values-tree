<script lang="ts" module>
	const PATHS = {
		undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
		redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
		share: 'M10 14a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6M14 10a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6',
		download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14',
		upload: 'M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 19.5h14',
		sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
		moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
		plus: 'M12 5v14M5 12h14',
		minus: 'M5 12h14',
		fit: 'M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15',
		search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
		close: 'M6 6l12 12M18 6 6 18',
		chevron: 'm9 6 6 6-6 6',
		down: 'm6 9 6 6 6-6',
		up: 'm6 15 6-6 6 6',
		arrowUp: 'M12 19V5m0 0-5 5m5-5 5 5',
		arrowDown: 'M12 5v14m0 0-5-5m5 5 5-5',
		copy: 'M9 9h9.5A1.5 1.5 0 0 1 20 10.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 18.5V9ZM15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9',
		print: 'M7 9V4h10v5M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 5 9h14a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z',
		tree: 'M4 12h3m0 0c4 0 4-6 8-6h1m-9 6c4 0 4 6 8 6h1M19 6h1M19 18h1M4.5 12h.01',
		doc: 'M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5ZM9.5 12h5M9.5 15.5h5',
		eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
		pencil: 'M14.5 5.5l4 4M4 20l1-4.5L16 4.5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19 4 20Z',
		history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5M3.5 4v4.5H8M12 7.5V12l3 2',
		more: 'M5 12h.01M12 12h.01M19 12h.01',
		link: 'M8 12h8M10 7H7.5a5 5 0 0 0 0 10H10m4-10h2.5a5 5 0 0 1 0 10H14',
		trash: 'M4.5 7h15M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7',
		check: 'm5 12.5 4.5 4.5L19 7.5',
		branch: 'M6 4v8a4 4 0 0 0 4 4h8m0 0-3.5-3.5M18 16l-3.5 3.5',
		offline: 'M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.4M19 12.5a10 10 0 0 0-3.2-2.1M2 9a15 15 0 0 1 4.7-3M22 9A15 15 0 0 0 11 5M12 20h.01'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 18, stroke = 1.7 }: { name: IconName; size?: number; stroke?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"><path d={PATHS[name]} /></svg>
