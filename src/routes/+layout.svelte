<script lang="ts">
	import '@fontsource-variable/fraunces/opsz.css';
	import '@fontsource-variable/fraunces/opsz-italic.css';
	import '@fontsource-variable/instrument-sans/wght.css';
	import '../app.css';
	import Toast from '$lib/components/Toast.svelte';
	let { children } = $props();
</script>

{@render children()}
<Toast />
