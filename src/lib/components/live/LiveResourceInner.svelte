<script>
	import { onMount, untrack } from 'svelte';
	import makeLive from '$lib/api/make_live.svelte.js';
	const { socket, resource, children } = $props();

	const liveState = makeLive(socket, resource);

	function dispatch(action, payload) {
		return liveState.send(action, payload);
	}

	function cast(action, payload) {
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
