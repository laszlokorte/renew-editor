<script>
	const { data } = $props();

	const { documents } = $derived(data);
</script>

<a href="/" title="Back">Back</a>


<h2>Documents</h2>

<ul>
	{#each documents as d}
		<li><a href="/documents/{d.id}/editor" title="Document #{d.id}">{d.name}</a></li>
	{/each}
</ul>
