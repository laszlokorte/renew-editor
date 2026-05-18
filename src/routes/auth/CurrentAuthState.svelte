<script>
	import { resolve } from '$app/paths';

	const { auth } = $props();
</script>

{#if auth.isAuthenticated}
	<a href={resolve('/auth')} style="max-width: 10vw;">{auth.value.email}</a>
	<!--<LogoutForm auth={auth} onSuccess={onLogout} />-->
{:else}
	<a href={resolve('/auth')}>Login</a>
{/if}

<style>
	a {
		color: inherit;
		text-decoration: none;
		padding: 1ex;
		display: inline-block;
		background: #0007;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
