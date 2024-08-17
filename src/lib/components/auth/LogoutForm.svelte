<script>
	import { goto } from '$app/navigation';

	const {auth} = $props()
</script>


<form onsubmit={evt => {
		evt.preventDefault()

		auth.logout()

		goto("/", {invalidateAll: true});
	}}>
	<button>Logout</button>
</form>

<style>

	button {
		padding: 0.5ex;
		border: none;
		background: black;
		color: #fff;
		font: inherit;
	}
</style>