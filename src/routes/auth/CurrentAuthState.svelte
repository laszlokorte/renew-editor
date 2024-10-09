<script>
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';

	import LogoutForm from '$lib/components/auth/LogoutForm.svelte';

	const { auth } = $props();

	function onLogout() {
		goto(base, { invalidateAll: true });
	}
</script>

{#if auth.isAuthenticated}
	<a href="{base}/auth">{auth.value.email.substr(0, 10)}...</a>
	<!--<LogoutForm auth={auth} onSuccess={onLogout} />-->
{:else}
	<a href="{base}/auth">Login</a>
{/if}

<style>
	a {
		color: inherit;
		text-decoration: none;
		padding: 1ex;
		display: inline-block;
		background: black;
	}
</style>
