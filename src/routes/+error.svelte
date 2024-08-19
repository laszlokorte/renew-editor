<script>
	import { page } from '$app/stores';
</script>

<section>
	<h1>{$page.status}: {$page.error.message}</h1>
</section>

<style>
	section {
		margin: 2em;
	}
</style>