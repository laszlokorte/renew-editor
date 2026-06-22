<script>
	import DocumentWorkspace from '$lib/components/workspace/DocumentWorkspace.svelte';
	import SimulationWorkspace from '$lib/components/workspace/SimulationWorkspace.svelte';

	let { data } = $props();
</script>

{#if data.workspaceType === 'simulation'}
	<SimulationWorkspace {data} embedded={true} />
{:else}
	<DocumentWorkspace {data} />
{/if}
