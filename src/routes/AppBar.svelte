<script>
	import * as env from '../env';
	import CurrentAuthState from './auth/CurrentAuthState.svelte'
	const favicon = '/favicon.svg';

	const appTitle = env.APP_NAME;

	const { authState } = $props();
</script>

<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 1ex 1em; background: #222; color: #fff">
	<a href="/"><h2 class="app-name"><img src={favicon} alt="Renew" class="icon" /> {appTitle}</h2></a>

	{#if authState}
	<CurrentAuthState auth={authState} />
	{/if}
</div>

<style>
	h2 {
		font-size: 1.2em;
	}
	.icon {
		width: 1.5em;
		height: 1.5em;
	}

	.app-name {
		display: flex;
		align-items: center;
		gap: 1ex;
		padding: 0.5ex;
		margin: 0;
	}

	a {
		color: #fff;
		text-decoration: none;
	}

</style>