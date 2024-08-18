<script>
	import { goto } from '$app/navigation';
	import { authenticate } from '$lib/api/auth.js'

	const { auth, onSuccess } = $props()

	/** @type undefined | {error: string, message:string} */
	let currentError = $state(undefined)

	/** @type undefined | HTMLInputElement */
	let passwordField = $state(undefined)


	/** @type {(evt: SubmitEvent) => void} */
	const onSubmit = (evt) => {
		evt.preventDefault()

		const formData = Object.fromEntries(
			new FormData(evt.currentTarget).entries(),
		)

		if(!formData.api_url) {
			currentError = {error: "url", message: "Invalid API URL"};
		} else {
			authenticate(formData.api_url, formData.email, formData.password)
			.then(token => {
				currentError = undefined
				auth.value = token

				onSuccess(auth)
			})
			.catch(e => {
				if(passwordField) {
					passwordField.value = ""
				}
				auth.logout()
				currentError = e
			})
		}

	}
</script>
<form onsubmit={onSubmit}>
	{#if currentError}
	<div style="color: red"><strong>{currentError.error}:</strong> {currentError.message}</div>
	{/if}

	<dl>
		<dt>API</dt>
		<dd><input type="url" name="api_url" value="http://localhost:9999/" required></dd>
		<dt>User</dt>
		<dd><input type="text" name="email"></dd>
		<dt>Password</dt>
		<dd><input type="password" bind:this={passwordField} name="password"></dd>
		<dt><span hidden>Actions</span></dt>
		<dd>
			<button>Login</button>
		</dd>
	</dl>
</form>

<style>
	dl {
		display: grid;
		grid-template-columns: auto auto;
		margin: 0;
		padding: 0;
		gap: 1ex;
		align-items: baseline;
	}

	dt, dd {
		margin: 0;
	}

	input, select, textarea {
		font: inherit;
	}

	button {
		border: 0;
		background: #333;
		color: #fff;
		font: inherit;
		padding: 1ex;
	}
</style>