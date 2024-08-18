<script>
	import { goto } from '$app/navigation';

	import LoginForm from '$lib/components/auth/LoginForm.svelte'
	import LogoutForm from '$lib/components/auth/LogoutForm.svelte'

	const { data } = $props();

	function onLogin() {
		goto("/", {invalidateAll: true});
	}
	function onLogout() {
	}
</script>

<section class="content">
	<h2>Login</h2>
	{#if data.authState.isAuthenticated}
	<p>
		You are already logged in.
	</p>
	<LogoutForm auth={data.authState} onSuccess={onLogout} />
	{:else}
	<LoginForm auth={data.authState} onSuccess={onLogin} />
	{/if}
</section>

<style>
	.content {
		display: grid;
		place-content: center;
	}
</style>