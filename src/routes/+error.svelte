<script>
	import { page } from '$app/stores';
	import AppBar from './AppBar.svelte';

	const {data} = $props();
</script>

<AppBar authState={data.authState} />

<section>
	<h1>Error {$page.status}: {$page.error.message}</h1>
</section>

<style>
	section {
		margin: 2em;
	}
</style>