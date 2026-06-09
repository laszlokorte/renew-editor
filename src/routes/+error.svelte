<script>
	import { page } from '$app/state';
	import AppBar from './AppBar.svelte';
	import Error from './Error.svelte';
	import { describeError } from '$lib/errors';

	const { data } = $props();
	const displayedError = $derived(describeError({ status: page.status, ...(page.error ?? {}) }));
</script>

<AppBar
	title={`${displayedError.title}${displayedError.status ? ` ${displayedError.status}` : ''}`}
	authState={data.authState}
/>

<section>
	<Error {page} />
</section>

<style>
	section {
		margin: 2em;
	}
</style>
