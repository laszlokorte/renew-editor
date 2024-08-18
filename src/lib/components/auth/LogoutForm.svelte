<script>
	const {auth, onSuccess} = $props()
</script>


<form onsubmit={evt => {
		evt.preventDefault()

		auth.logout()

		onSuccess(auth)
	}}>
	<button>Logout</button>
</form>

<style>

	button {
		padding: 1ex;
		border: none;
		background: black;
		color: #fff;
		font: inherit;
		cursor: pointer;
	}
</style>