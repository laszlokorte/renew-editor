<script>
	const { page } = $props();
	import { goto } from '$app/navigation';

	import authState from '$lib/components/auth/local_state.svelte.js';
	import LoginForm from '$lib/components/auth/LoginForm.svelte';

	import { base } from '$app/paths';
	function onLogin(auth) {
		return new Promise((resolve) => {
			goto(`${base}`, { invalidateAll: true }).then((_) => {
				resolve(auth);
			});
		});
	}
	function onLogout() {
		goto(`${base}/auth`, { invalidateAll: true });
	}
</script>

<div>
	<h1 class="center">Error {$page.status}: {$page.error.message}</h1>

	{#if $page.status === 401 || $page.status === 403}
		{#if authState.value}
			<p class="center">
				You are currently connect to <a href="{base}/auth">{authState.value.url}</a>.
			</p>
			<p class="center">But your session seems to be expired. Try to log in again.</p>
		{/if}

		<div style:max-width="20em" style:margin="auto">
			<LoginForm auth={authState} onSuccess={onLogin} />
		</div>
	{/if}

	<hr />

	<p class="center">
		<a href="{base}/">Back to Homepage</a>
	</p>
</div>

<style>
	.center {
		text-align: center;
	}

	hr {
		border: none;
		border-bottom: 1px solid #aaa;
		margin: 2em 0;
	}
</style>
