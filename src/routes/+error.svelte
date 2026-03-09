<script>
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import AppBar from './AppBar.svelte';
	import Error from './Error.svelte';

	const { data } = $props();
</script>

<AppBar title={`Error ${$page.status}: ${$page.error.message}`} authState={data.authState} />

<section>
	<Error {page} />
</section>

<style>
	section {
		margin: 2em;
	}

	.center {
		text-align: center;
	}
</style>
