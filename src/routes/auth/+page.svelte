<script>
	import { goto } from '$app/navigation';

	import LoginForm from '$lib/components/auth/LoginForm.svelte';
	import LogoutForm from '$lib/components/auth/LogoutForm.svelte';
	import AppBar from '../AppBar.svelte';

	const { data } = $props();

	function onLogin(auth) {
		return new Promise((resolve) => {
			goto('/', { invalidateAll: true }).then((_) => {
				resolve(auth);
			});
		});
	}
	function onLogout() {}
</script>

<AppBar authState={data.authState} />

<section class="content">
	{#if data.authState.isAuthenticated}
		<h2>Log out</h2>
		<p>You are currently logged in.</p>
		<div class="center">
			<LogoutForm auth={data.authState} onSuccess={onLogout} />
		</div>
	{:else}
		<h2>Login</h2>
		<LoginForm auth={data.authState} onSuccess={onLogin} />
	{/if}
</section>

<style>
	h2 {
		text-align: center;
	}

	.content {
		display: grid;
		place-content: center;
	}

	.center {
		text-align: center;
	}
</style>
