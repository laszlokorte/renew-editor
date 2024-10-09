<script>
	const { auth, onSuccess } = $props();
</script>

<form
	onsubmit={(evt) => {
		evt.preventDefault();

		auth.logout();

		onSuccess(auth);
	}}
>
	<button>Logout</button>
</form>

<style>
	button {
		padding: 1.5ex 2ex;
		border: none;
		background: black;
		color: #fff;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		background: #880000;
	}

	button:active {
		background: #550000;
	}

	button:focus-visible {
		outline: 2px solid #dd5555;
		background: #550000;
	}
</style>
