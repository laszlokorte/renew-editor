<script>
	import * as env from '../env';
	import CurrentAuthState from './auth/CurrentAuthState.svelte'
	const favicon = '/favicon.svg';

	const appTitle = env.APP_NAME;

	const { children, data } = $props();
</script>

<svelte:head>
	<title>{appTitle}</title>
</svelte:head>


{@render children()}

<style>

	:global(body) {
		margin: 0;
		padding: 0;
		font-family: monospace;
	}

</style>
