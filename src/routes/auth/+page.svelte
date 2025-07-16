<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import LogoutForm from '$lib/components/auth/LogoutForm.svelte';
	import AppBar from '../AppBar.svelte';

	const { data } = $props();

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

<AppBar title={data.authState.isAuthenticated ? 'Account' : 'Login'} authState={data.authState} connectionState={data.connectionState} />

<section class="content">
	<div>
		{#if data.authState.isAuthenticated}
			<p class="center">
				<a href="{base}/">Dashboard</a>
			</p>
			<h2>Authentication</h2>
			<div style=" line-height: 2; display: flex; flex-direction: column; align-items: stretch;">
				You are currently connected to
				<br />
				<div
					style="border-radius: 1ex; display: inline-block; padding: 0.5ex 1ex; color: #000; background: #ddeeee; display: flex; gap: 1ex; padding: 1ex 1em 1ex 1ex;"
				>
					<button
						type="button"
						class="refresh"
						title={`Last update: ${data.authState.lastRefresh.toLocaleString()}`}
						onclick={(evt) => {
							const target = evt.currentTarget;
							target.classList.add('loading');
							data.authState
								.refresh(window.fetch)
								.then(() => {
									target.classList.remove('loading');
								})
								.finally(() => {
									target.classList.remove('loading');
								});
						}}
						aria-label="refresh">↻</button
					>
					<a style="color: inherit;" href={data.authState.value.url} target="_blank"
						>{data.authState.value.url}</a
					>
				</div>
				<br />
				and logged in in as<br />
				<strong
					style="border-radius: 1ex; display: inline-block; padding: 0.5ex 1ex; color: #000; background: #ddeeee; text-align: center; font-size: large;"
					>{data.authState.value.email}</strong
				>
			</div>
			<hr />
			<div class="center">
				{#if data.authState.routes.backend}
					<a href={data.authState.routes.backend.href} target="_blank" class="button">Backend</a>
				{/if}
				<LogoutForm auth={data.authState} onSuccess={onLogout} />
			</div>
		{:else}
			<h2>Login</h2>
			<LoginForm auth={data.authState} onSuccess={onLogin} />
		{/if}
	</div>
</section>

<style>
	h2 {
		text-align: center;
	}

	.button {
		display: block;
		padding: 1.5ex 2ex;
		border: none;
		background: black;
		color: #fff;
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.content {
		display: grid;
		justify-content: center;
		justify-items: stretch;
	}

	.refresh {
		background: none;
		border: none;
		font: inherit;
		cursor: pointer;
		background: #000a;
		color: #fff;
		font-size: 1.25em;
		width: 1.5em;
		height: 1.5em;
		display: grid;
		padding: 0;
		align-content: center;
		justify-content: center;
		border-radius: 100%;
		transform: rotate(0);
		transition: 1s transform ease;
	}

	.refresh:hover {
		background: #0009;
	}

	.refresh:active {
		background: #000c;
	}

	.refresh:global(.loading) {
		transform: rotate(720deg);
	}

	.center {
		text-align: center;
		display: flex;
		gap: 1em;
		justify-content: center;
	}

	hr {
		border: none;
		border-top: 1px solid #aaa;
	}

	a {
		color: rgb(35, 135, 93);
	}
</style>
