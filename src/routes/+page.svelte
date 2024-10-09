<script>
	import { base } from '$app/paths';
	import AppBar from './AppBar.svelte';

	const { data } = $props();
</script>

<AppBar authState={data.authState} />

<section class="hero">
	<h2>Renew Web</h2>

	<p>Welcome to the Renew Web Editor</p>

	<a href="{base}/documents" class="action">View Documents</a>
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
