<script>
	import { page } from '$app/state';
	import AppBar from '../../AppBar.svelte';
	import Error from '../../Error.svelte';

	const { data } = $props();
	const { project } = data;
</script>

<AppBar
	active="projects"
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
</style>
