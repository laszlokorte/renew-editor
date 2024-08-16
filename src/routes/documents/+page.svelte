<script>
	import Logout from '../auth/Logout.svelte'
	const { data } = $props();

	const { documents } = $derived(data);
</script>

<h2>Welcome</h2>

<Logout />

<ul>
	{#each documents as d}
		<li><a href="/documents/{d}/editor" title="Document {d}">{d}</a></li>
	{/each}
</ul>
