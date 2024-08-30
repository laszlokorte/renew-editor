<script>
	import { page } from '$app/stores';
	import AppBar from './AppBar.svelte';

	const {data} = $props();
</script>

<AppBar authState={data.authState} />

<section>
	<h1 class="center">Error {$page.status}: {$page.error.message}</h1>

	<p class="center">
		<a href="/">Back to Homepage</a>
	</p>
</section>

<style>
	section {
		margin: 2em;
	}

	.center {
		text-align: center;
	}
</style>