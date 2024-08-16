<script>
	import { goto } from '$app/navigation';
	import authState from './auth_state.svelte.js'
</script>


<form onsubmit={evt => {
		evt.preventDefault()

		authState.isAuthenticated = false

		goto("/", {invalidateAll: true});
	}}>
	<button>Logout</button>
</form>