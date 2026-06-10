<script>
	import * as env from '../envvars';

	const appTitle = env.APP_NAME;

	const { children } = $props();
</script>

<svelte:head>
	<title>{appTitle}</title>
</svelte:head>

{@render children()}
