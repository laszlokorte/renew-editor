<script>
	import { goto } from '$app/navigation';
	import authState from './auth_state.svelte.js'

	/* @type any */
	let currentError = $state(undefined)
	let passwordField = $state(undefined)

	const tryLogin = (authData) => {
		return fetch(authData.api_url, {
			method: "POST",
			mode: "cors",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: authData.email,
				password: authData.password,
			})
		}).catch(e => {
			throw {error: "network", details: {message: e.message}}
		}).then((r) => {
			if (r.ok) {
				return r.json().then((json)=> {
					return json.token
				}).catch(e => {
					throw {error: "auth", status: r.status, details: {message: "Invalid JSON", data: e}}
				})
			} else {
				return r.json().catch(e => {
					throw {error: "auth", status: r.status, details: {message: "Unexpected Server Response", data: e}}
				}).then((json) => {
					throw {error: "auth", status: r.status, details: json.error}
				})
			}
		})
	}

	const onSubmit = (evt) => {
		evt.preventDefault()

		const formData = Object.fromEntries(
			new FormData(evt.currentTarget).entries(),
		)

		if(!formData.api_url) {
			currentError.value = "Invalid API URL";
		} else {
			tryLogin(formData)
			.then(token => {
				currentError = undefined
				authState.token = token

				goto("/", {invalidateAll: true});
			})
			.catch(e => {
				if(passwordField) {
					passwordField.value = ""
				}
				authState.isAuthenticated = false
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
		<dd><input type="text" bind:this={passwordField} name="password"></dd>
		<dt>Actions</dt>
		<dd>
			<button>Login</button>
		</dd>
	</dl>
</form>