<script>
	import { goto } from '$app/navigation';

	import LogoutForm from '$lib/components/auth/LogoutForm.svelte'

	const {auth} = $props()

	function onLogout() {
		goto("/", {invalidateAll: true});
	}
</script>

{#if auth.isAuthenticated}
<LogoutForm auth={auth} onSuccess={onLogout} />
{:else}
<a href="/auth">Login</a>
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