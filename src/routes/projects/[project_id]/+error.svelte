<script>
	import { page } from '$app/state';
	import AppBar from '../../AppBar.svelte';
	import Error from '../../Error.svelte';
	import { describeError } from '$lib/errors';

	const { data } = $props();
	const { project } = data;
	const displayedError = $derived(describeError({ status: page.status, ...(page.error ?? {}) }));
</script>

<AppBar
	active="projects"
	title={`${displayedError.title}${displayedError.status ? ` ${displayedError.status}` : ''}`}
	projectId={project.id}
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
