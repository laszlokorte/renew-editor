<script>
	import LiveResourceInner from './LiveResourceInner.svelte';
	const { socket, resource, children } = $props();
</script>

{#key resource.id}
	<LiveResourceInner {socket} {resource}>
		{#snippet children(content, presence, actions)}
			{@render children(content, presence, actions)}
		{/snippet}
	</LiveResourceInner>
{/key}
