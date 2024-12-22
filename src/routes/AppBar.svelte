<script>
	import { base } from '$app/paths';
	import * as env from '../env';
	import CurrentAuthState from './auth/CurrentAuthState.svelte';
	import { view, atom, update } from '$lib/reactivity/atom.svelte';

	const favicon = '';

	const appTitle = env.APP_NAME;

	const { authState, errors = atom([]) } = $props();

	function discardError() {
		update((e) => e.slice(1), errors);
	}
</script>

<div
	style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 1ex 1em; background: #222; color: #fff; user-select: none;"
>
	<a href="{base}/"
		><h2 class="app-name">
			<img src="{base}/favicon.svg" alt="Renew" class="icon" />
			{appTitle}
		</h2></a
	>

	<div
		style="margin-right: auto;padding: 0 1em; display: flex; gap: 1ex; margin-left: 2em; border-left: 1px solid #555;"
	>
		{#if authState.isAuthenticated}
		<a href="{base}/documents" class="nav-button" title="Documents Overview">Documents</a>
		<a href="{base}/simulations" class="nav-button" title="Simulations Overview">Simulations</a>
		{/if}
	</div>

	<div>
		{#if errors.value.length}
			<div class="error">
				Error: <span>{errors.value[0]}</span>
				<button class="error-discard" onclick={discardError}
					>Discard
					{#if errors.value.length > 1}
						({errors.value.length - 1} more)
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

	@media (hover: hover) {
		.nav-button:hover {
			background: #aaa3;
		}
	}

	.nav-button {
		padding: 1ex 1em;
		max-width: 10vw;
		overflow: hidden;
		text-overflow: ellipsis;
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
