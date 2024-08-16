<script>
	const favicon = '/favicon.svg';
	import * as env from '../env';
	import Logout from './auth/Logout.svelte'

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<h2>Welcome</h2>

{#if data.authed}
<Logout />
{:else}
<a href="/auth">Login</a>
{/if}

<ul>
	<li><a href="/documents">Show Documents</a></li>
</ul>