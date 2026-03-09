<script>
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import AppBar from '../../../AppBar.svelte';
	import Error from '../../../Error.svelte';

	const { data } = $props();
	const { project } = data;
</script>

<AppBar
	active="documents"
	title={`Error ${$page.status}: ${$page.error.message}`}
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
	.center {
		text-align: center;
	}
</style>
