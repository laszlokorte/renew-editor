<script>
	import { onMount } from 'svelte';
	import makeLive from '$lib/api/make_live.svelte.js';
	const { socket, resource, children } = $props();

	let liveValue = makeLive(socket, resource);

	onMount(() => {
		return () => {
			liveValue.unsubscribe();
		};
	});
</script>

{@render children(liveValue.value, liveValue.presence)}
