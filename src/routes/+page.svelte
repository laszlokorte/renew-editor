<script>
	const favicon = '/favicon.svg';
	import * as env from '../env';

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>



<section class="hero">

<h2>Renew Web</h2>

<p>Welcome to the Renew Web Editor</p>

<a href="/documents" class="action">View Documents</a>

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