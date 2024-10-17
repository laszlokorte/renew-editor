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

<AppBar authState={data.authState} />

<section class="content">
	<div>
		{#if data.authState.isAuthenticated}
			<p class="center">
				<a href="{base}/">Dashboard</a>
			</p>
			<h2>Authentication</h2>
			<p style=" line-height: 2; display: flex; flex-direction: column; align-items: stretch;">
				You are currently connected to
				<br />
				<span
					style="border-radius: 1ex; display: inline-block; padding: 0.5ex 1ex; color: #000; background: #ddeeee"
					>{data.authState.value.url}</span
				><br />
				and logged in in as<br />
				<strong
					style="border-radius: 1ex; display: inline-block; padding: 0.5ex 1ex; color: #000; background: #ddeeee; text-align: center; font-size: large;"
					>{data.authState.value.email}</strong
				>
			</p>
			<hr />
			<div class="center">
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

	.content {
		display: grid;
		justify-content: center;
		justify-items: stretch;
	}

	.center {
		text-align: center;
	}

	hr {
		border: none;
		border-top: 1px solid #aaa;
	}

	a {
		color: rgb(35, 135, 93);
	}
</style>
