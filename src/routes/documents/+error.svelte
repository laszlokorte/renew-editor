<script>
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import AppBar from '../AppBar.svelte';

	const { data } = $props();
</script>

<AppBar authState={data.authState} />

<section>
	<h1 class="center">Error {$page.status}: {$page.error.message}</h1>

	{#if $page.status === 401 || $page.status === 403}
		<p class="center">Try to <a href="{base}/auth">log out</a> and log in again.</p>
	{/if}

	<p class="center">
		<a href="{base}/documents">Back to Document list</a>
	</p>
</section>

<style>
	section {
		margin: 2em;
	}
	.center {
		text-align: center;
	}
</style>
