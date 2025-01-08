<script>
	import LiveResourceInner from './LiveResourceInner.svelte';
	const { socket, resource, children, debug = false } = $props();
</script>

{#key resource.id}
	<LiveResourceInner {socket} {resource} {debug}>
		{#snippet children(content, presence, actions)}
			{@render children(content, presence, actions)}
		{/snippet}
	</LiveResourceInner>
{/key}
