<script>
	import * as env from '../env';
	import CurrentAuthState from './auth/CurrentAuthState.svelte'
	const favicon = '/favicon.svg';

	const appTitle = env.APP_NAME;

	const { authState, errors = $bindable([]) } = $props();

	function discardError() {
		errors.pop()
	}
</script>

<div style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 1ex 1em; background: #222; color: #fff">
	<a href="/"><h2 class="app-name"><img src={favicon} alt="Renew" class="icon" /> {appTitle}</h2></a>

	<div>
		{#if errors.length}
		<div class="error">
		Error: <span>{errors[0]}</span>
		<button class="error-discard" onclick={discardError}>Discard
			{#if errors.length > 1}
			({errors.length - 1} more)
			{/if}
		</button>
		</div>
		{/if}
	</div>

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

	.error {
		background: #660000;
		color: #fff;
		align-self: stretch;
		padding: 0.5ex 1em;
		border: 1px solid #aa0000;
		border-radius: 0.5ex;
		display: flex;
		gap: 1em;
		align-items: baseline;
	}

	.error-discard {
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		cursor: pointer;
		padding: 0;
		margin: 0;
		font-size: smaller;
	}

</style>