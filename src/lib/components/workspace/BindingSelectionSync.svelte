<script>
	const { content, selection, sync } = $props();

	$effect(() => {
		sync?.(selection, content);
	});
</script>
