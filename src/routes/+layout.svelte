<script>
	const favicon = '/favicon.svg';
	const { children } = $props();
</script>

<svelte:head>
	<title>Renew Editor</title>
</svelte:head>

<h2 class="app-name"><img src={favicon} alt="Renew" class="icon" /> Renew Editor</h2>

{@render children()}

<style>
	.icon {
		width: 1.5em;
		height: 1.5em;
	}

	.app-name {
		display: flex;
		align-items: center;
		gap: 0.5ex;
		padding: 0.5ex;
		margin: 0;
	}

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: monospace;
	}
</style>
