<script>
	const favicon = '/favicon.svg';
	import * as env from '../env';
	import Logout from './auth/Logout.svelte'
	import AuthState from './auth/AuthState.svelte'

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AuthState />


<h2>Renew Web</h2>

<p>Welcome to the Renew Web Editor</p>

<a href="/documents">View Documents</a>