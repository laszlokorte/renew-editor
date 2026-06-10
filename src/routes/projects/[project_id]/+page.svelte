<script>
	import { resolve } from '$app/paths';
	import AppBar from '../../AppBar.svelte';
	import * as env from '../../../envvars';

	const { data } = $props();
	const { project } = data;
</script>

<AppBar
	active="projects"
	title="Project {project.id} Overview"
	projectId={project.id}
	authState={data.authState}
	connectionState={data.connectionState}
/>

<section class="hero">
	<h2>Project Overview</h2>

	<div style="display: flex; margin: 1ex; gap: 1ex">
		<a href={resolve(`/projects/${project.id}/documents`)} class="action">View Documents</a>
		<a href={resolve(`/projects/${project.id}/simulations`)} class="action">View Simulations</a>
		<a href={resolve(`/projects/${project.id}/settings`)} class="action">Project Settings</a>
	</div>
	<div style="display: flex; margin: 1ex; gap: 1ex">
		<a href="mailto:petristation@laszlokorte.de?subject=Petristation%20Feedback" class="action"
			>Send Feedback</a
		>
	</div>
</section>

<style>
	section {
		margin: 1ex 1.5em;
	}

	.hero {
		display: grid;
		justify-content: center;
		justify-items: center;
	}

	.action {
		padding: 1ex;
		background: #333;
		color: #fff;
		text-decoration: none;
	}
</style>
