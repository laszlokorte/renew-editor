<script>
	import LogoutForm from '$lib/components/auth/LogoutForm.svelte'

	const {auth} = $props()
</script>

{#if auth.isAuthenticated}
<LogoutForm auth={auth} />
{:else}
<a href="/auth">Login</a>
{/if}