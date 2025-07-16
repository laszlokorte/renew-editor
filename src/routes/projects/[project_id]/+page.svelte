<script>
	import { base } from '$app/paths';
	import AppBar from '../../AppBar.svelte';
	import * as env from '../../../env';

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar  title={`Project Overview`} projectId={"fooo"} authState={data.authState} connectionState={data.connectionState} />

<section class="hero">

	<h2>Project Overview</h2>

	<div style="display: flex; margin: 1ex; gap: 1ex">
		<a href="{base}/projects/fooo/documents" class="action">View Documents</a>
		<a href="{base}/projects/fooo/simulations" class="action">View Simulations</a>
		<a href="{base}/projects/fooo/settings" class="action">Project Settings</a>
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
