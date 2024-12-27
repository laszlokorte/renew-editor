<script>
	import { base } from '$app/paths';
	import AppBar from './AppBar.svelte';
	import * as env from '../env';

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar authState={data.authState} />

<section class="hero">
	<h2>{appTitle}</h2>

	<p>Welcome to the {appTitle} Web Editor</p>

	<div>
		<a href="{base}/documents" class="action">View Documents</a>
		<a href="{base}/simulations" class="action">View Simulations</a>
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
