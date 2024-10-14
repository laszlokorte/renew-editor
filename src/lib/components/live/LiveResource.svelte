<script>
	import { onMount } from 'svelte';
	import makeLive from '$lib/api/make_live.svelte.js';
	const { socket, resource, children } = $props();

	const liveState = makeLive(socket, resource);

	function dispatch(action, payload) {
		return liveState.send(action, payload);
	}

	onMount(() => {
		return () => {
			liveState.unsubscribe();
		};
	});
</script>

{@render children(liveState.content, liveState.presence, dispatch)}
