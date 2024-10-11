<script>
	import { onMount } from 'svelte';
	import makeLive from '$lib/api/make_live.svelte.js';
	const { socket, resource, children } = $props();

	let liveState = makeLive(socket, resource);

	function dispatch(action, payload) {
		return liveState.send(action, payload);
	}

	onMount(() => {
		return () => {
			liveState.unsubscribe();
		};
	});
</script>

{@render children(liveState.value, liveState.presence, dispatch)}
