<script>
	import { base } from '$app/paths';
	import AppBar from './AppBar.svelte';
	import * as env from '../env';

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar  title={`Welcome`} authState={data.authState} connectionState={data.connectionState} />

<section class="hero">
	<img style="max-width: 5em; margin: 1em auto" src="{base}/favicon.svg" alt="Renew" class="icon" />

	<h2>{appTitle}</h2>

	<p>Welcome to the {appTitle} Web Editor</p>

	<div style="display: flex; margin: 1ex; gap: 1ex">
		<a href="{base}/projects" class="action">View Your Projects</a>
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
