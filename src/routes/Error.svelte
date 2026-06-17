<script>
	const { page } = $props();
	import { goto } from '$app/navigation';

	import authState from '$lib/components/auth/local_state.svelte.js';
	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import { describeError } from '$lib/errors';

	import { resolve } from '$app/paths';
	const displayedError = $derived(describeError({ status: page.status, ...(page.error ?? {}) }));

	function onLogin(auth) {
		return new Promise((res) => {
			goto(resolve('/'), { invalidateAll: true }).then((_) => {
				res(auth);
			});
		});
	}
</script>

<div>
	<h1 class="center">
		{displayedError.title}{displayedError.status ? ` ${displayedError.status}` : ''}
	</h1>
	<p class="center">{displayedError.message}</p>

	{#if displayedError.detail}
		<p class="center detail">{displayedError.detail}</p>
	{/if}

	{#if page.status === 401 || page.status === 403}
		{#if authState.value}
			<p class="center">
				You are currently connect to <a href={resolve('/auth')}>{authState.value.url}</a>.
			</p>
			<p class="center">But your session seems to be expired. Try to log in again.</p>
		{/if}

		<div style:max-width="20em" style:margin="auto">
			<LoginForm auth={authState} onSuccess={onLogin} />
		</div>
	{/if}

	<hr />

	<p class="center">
		<a href={resolve('/')}>Back to Homepage</a>
	</p>
</div>

<style>
	.center {
		text-align: center;
	}

	.detail {
		color: #666;
		font-size: 0.9em;
	}

	hr {
		border: none;
		border-bottom: 1px solid #aaa;
		margin: 2em 0;
	}
</style>
