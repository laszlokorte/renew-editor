<script>
	import { onMount, untrack } from 'svelte';
	import makeLive from '$lib/api/make_live.svelte.js';
	const { socket, resource, children, debug = false } = $props();

	const liveState = makeLive(socket, resource);

	function dispatch(action, payload) {
		if (debug) {
			console.log('dispatch', action, payload);
		}
		return liveState.send(action, payload);
	}

	function cast(action, payload) {
		if (debug) {
			console.log('cast', action, payload);
		}
		return liveState.cast(action, payload);
	}

	onMount(() => {
		return () => {
			if (liveState) {
				liveState.unsubscribe();
			}
		};
	});
</script>

{#key resource.id}
	{@render children(liveState.content, liveState.presence, { dispatch, cast })}
{/key}
