<script>
	import { goto } from '$app/navigation';
	import { authenticate } from '$lib/api/auth.js'

	const { auth } = $props()

	/* @type any */
	let currentError = $state(undefined)
	let passwordField = $state(undefined)


	const onSubmit = (evt) => {
		evt.preventDefault()

		const formData = Object.fromEntries(
			new FormData(evt.currentTarget).entries(),
		)

		if(!formData.api_url) {
			currentError.value = "Invalid API URL";
		} else {
			authenticate(formData.api_url, formData.email, formData.password)
			.then(token => {
				currentError = undefined
				auth.token = token

				goto("/", {invalidateAll: true});
			})
			.catch(e => {
				if(passwordField) {
					passwordField.value = ""
				}
				auth.isAuthenticated = false
				currentError = e
			})
		}

	}
</script>
<form onsubmit={onSubmit}>
	{#if currentError}
	<div style="color: red"><strong>{currentError.error}:</strong> {currentError.details.message}</div>
	{/if}

	<dl>
		<dt>API</dt>
		<dd><input type="url" name="api_url" value="http://localhost:9999/" required></dd>
		<dt>User</dt>
		<dd><input type="text" name="email"></dd>
		<dt>Password</dt>
		<dd><input type="password" bind:this={passwordField} name="password"></dd>
		<dt>Actions</dt>
		<dd>
			<button>Login</button>
		</dd>
	</dl>
</form>