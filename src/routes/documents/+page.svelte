<script>
	import AuthState from '../auth/AuthState.svelte'
	const { data } = $props();

	const { documents } = $derived(data);
</script>

<AuthState />

<a href="/" title="Back">Back</a>


<h2>Documents</h2>

<ul>
	{#each documents as d}
		<li><a href="/documents/{d}/editor" title="Document {d}">{d}</a></li>
	{/each}
</ul>
