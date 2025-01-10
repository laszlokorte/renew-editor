<script>
	import { goto } from '$app/navigation';
	import { authenticate } from '$lib/api/auth.js';
	import { getMetas } from '../../../env.js';

	const { auth, onSuccess } = $props();

	const knownApis = getMetas('env_known_api').map((v) => {
		const kv = Object.fromEntries(
			v
				.split(',', 2)
				.map((s) => s.trim())
				.map((s) => s.split('=', 2))
		);

		return kv;
	});

	let apiUrl = $state(knownApis[0]?.url ?? '');

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

			authenticate(window.fetch, formData.api_url, formData.email, formData.password)
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
				id="login_form_server_new"
				class="text-input"
				type="url"
				name="api_url"
				bind:value={apiUrl}
				list="known_apis"
				autocomplete={null}
				required
			/>
			<datalist id="known_apis">
				{#each knownApis as ka}
					<option value={ka.url}>{ka.label}</option>
				{/each}
			</datalist>
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
		background: #003366;
	}

	button {
		border: 0;
		background: #333;
		color: #fff;
		font: inherit;
		padding: 1.5ex 2ex;
		cursor: pointer;
	}

	button:disabled {
		color: #fff8;
	}

	button:hover {
		background: #005588;
	}

	button:active {
		background: #003366;
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
