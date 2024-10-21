<script>
	import { onMount, tick } from 'svelte';

	const { onMount: mnt } = $props();

	onMount(async () => {
		await tick();
		mnt();
	});
</script>
