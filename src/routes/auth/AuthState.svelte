<script>
	import authState from './auth_state.svelte.js'
	import Logout from './Logout.svelte'
</script>

{#if authState.isAuthenticated}
<Logout />
{:else}
<a href="/auth">Login</a>
{/if}