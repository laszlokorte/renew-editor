<script>
	import authState from '$lib/components/auth/local_state.svelte.js'
	import LogoutForm from '$lib/components/auth/LogoutForm.svelte'
</script>

{#if authState.isAuthenticated}
<LogoutForm auth={authState} />
{:else}
<a href="/auth">Login</a>
{/if}