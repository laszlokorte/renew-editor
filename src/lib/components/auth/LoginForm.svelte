<script>
	import { goto } from '$app/navigation';
	import { authenticate } from '$lib/api/auth.js';

	const { auth, onSuccess } = $props();

	let apiUrl = $state('http://localhost:4000/api');

	/** @type undefined | {error: string, message:string} */
	let currentError = $state(undefined);

	/** @type undefined | HTMLInputElement */
	let passwordField = $state(undefined);

	let inProgress = $state(false);

	/** @type {(evt: SubmitEvent) => void} */
	const onSubmit = (evt) => {
		evt.preventDefault();

		if (inProgress) {
			return;
		}

		/** @type HTMLFormElement */
		const form = evt.currentTarget;

		if (!form.checkValidity()) {
			return;
		}

		const formData = Object.fromEntries(new FormData(form).entries());

		if (!formData.api_url) {
			currentError = { error: 'url', message: 'Invalid API URL' };
		} else {
			inProgress = true;

			authenticate(formData.api_url, formData.email, formData.password)
				.then((token) => {
					currentError = undefined;
					auth.login(token);

					onSuccess(auth);
				})
				.catch((e) => {
					auth.logout();
					currentError = e;
				})
				.then(() => {
					inProgress = false;
				});
		}
	};
</script>

<form onsubmit={onSubmit}>
	{#if currentError}
		<dl class="error-message">
			<dt><strong>Error: </strong></dt>
			<dd>{currentError.message}</dd>
		</dl>
	{/if}

	<dl>
		<dt><label for="login_form_server">Server:</label></dt>
		<dd>
			<input
				disabled={inProgress}
				id="login_form_server"
				class="text-input"
				type="url"
				name="api_url"
				bind:value={apiUrl}
				required
			/>
		</dd>
		<dt><label for="login_form_user">E-mail:</label></dt>
		<dd>
			<input
				disabled={inProgress}
				id="login_form_user"
				class="text-input"
				type="email"
				name="email"
				required
			/>
		</dd>
		<dt><label for="login_form_password">Password:</label></dt>
		<dd>
			<input
				disabled={inProgress}
				id="login_form_password"
				class="text-input"
				type="password"
				bind:this={passwordField}
				name="password"
				required
			/>
		</dd>
		<dt><span hidden>Actions</span></dt>
		<dd>
			<button disabled={inProgress}
				>{#if inProgress}Authenticating&hellip;{:else}Login{/if}</button
			>
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
		box-sizing: border-box;
	}

	dt,
	dd {
		margin: 0;
	}

	dt {
		text-align: right;
	}

	.text-input {
		font: inherit;
		padding: 1ex;
		min-width: 20em;
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #aaa;
	}

	.text-input:user-invalid {
		border-color: #aa0000;
		outline: 1px solid #aa0000;
	}

	.text-input:focus-visible {
		outline: 2px solid #00aaff;
	}

	button:focus-visible {
		outline: 2px solid #00aaff;
	}

	button {
		border: 0;
		background: #333;
		color: #fff;
		font: inherit;
		padding: 1ex;
		cursor: pointer;
	}

	button:disabled {
		color: #fff8;
	}

	input:disabled {
		color: #0008 !important;
	}

	.error-message {
		color: #aa0000;
		border-bottom: 1px solid #aa0000;
		margin: 1ex 0 1ex auto;
		padding: 1ex;
		width: 100%;
		box-sizing: border-box;
	}
</style>
