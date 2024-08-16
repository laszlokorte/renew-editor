<script>
	const { data } = $props();

	const { documents } = $derived(data);
</script>

<h2>Welcome</h2>


<form action="logout" method="post">
	<button>Logout</button>
</form>

<ul>
	{#each documents as d}
		<li><a href="/document/{d}/editor" title="Document {d}">{d}</a></li>
	{/each}
</ul>
