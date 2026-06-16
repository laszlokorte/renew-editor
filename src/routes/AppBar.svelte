<script>
	import { onMount } from 'svelte';
	import { preloadCode } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as env from '../envvars';
	import CurrentAuthState from './auth/CurrentAuthState.svelte';
	import { atom, update } from '$lib/reactivity/atom.svelte';
	import { describeError } from '$lib/errors';

	import SplashScreen from '$lib/components/splashscreen/SplashScreen.svelte';

	const appTitle = env.APP_NAME;

	const {
		title,
		projectId = null,
		authState,
		errors = atom([]),
		connectionState = atom(undefined),
		active = null
	} = $props();

	function discardError(index) {
		update((items) => items.filter((_, itemIndex) => itemIndex !== index), errors);
	}

	function discardAllErrors() {
		errors.value = [];
	}

	function formatCopyText(error) {
		const description = describeError(error);
		const title = description.status
			? `${description.title} ${description.status}`
			: description.title;

		return [title, description.message, description.detail].filter(Boolean).join('\n\n');
	}

	function copyError(error) {
		navigator.clipboard?.writeText(formatCopyText(error));
	}

	function scheduleEditorPreload() {
		const preloadEditor = () => {
			preloadCode('/documents/__editor_preload__/editor').catch(() => {
				// Best-effort warm-up for the large editor route.
			});
		};

		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(preloadEditor, { timeout: 2000 });
		} else {
			setTimeout(preloadEditor, 700);
		}
	}

	onMount(() => {
		function handleAppError(evt) {
			errors.value = [...errors.value, evt.detail ?? evt];
		}

		window.addEventListener('petristation:error', handleAppError);
		scheduleEditorPreload();

		return () => {
			window.removeEventListener('petristation:error', handleAppError);
		};
	});
</script>

<svelte:head>
	<title>{[title, appTitle].filter((x) => x).join(' - ')}</title>
</svelte:head>

<SplashScreen icon={resolve('/favicon.svg')} color="white" />

<div
	class={{
		'app-bar': true,
		offline: connectionState.value === false,
		unknown: connectionState.value === undefined
	}}
>
	<a href={resolve('/')}
		><h2 class="app-name">
			<img
				style="grid-row: 1; grid-column: 1;"
				src={resolve('/favicon.svg')}
				alt="Renew"
				class="icon"
			/>

			<span class="titel" style="grid-row: 1; grid-column: 2;">{appTitle}</span>

			{#if connectionState.value === false}
				<button
					type="button"
					class="offline-indicator"
					onclick={(evt) => {
						authState.reconnectSocket();
					}}>Offline</button
				>
			{/if}
		</h2></a
	>

	<div class="nav-row">
		{#if authState.isAuthenticated}
			<a
				href={resolve('/projects')}
				class={['nav-button', active == 'projects' && 'active']}
				title="Projects Overview"
			>
				<svg
					viewBox="0 0 150 128"
					class="nav-icon"
					xmlns="http://www.w3.org/2000/svg"
					fill="currentColor"
					preserveAspectRatio="xMidYMid meet"
				>
					<title>Project overview</title>
					<path
						d="m17.897 70.077 55.597-42.62 53.562 41.62v54.559H87.881V85.34h-29.81v38.295l-40.174 1V70.077Z"
					/><path
						d="M8.453 66.109 0 55.24 73.52 0l72.58 54.872-8.107 10.867-64.474-48.49L8.453 66.11Z"
					/>
				</svg>
			</a>
			{#if projectId}
				<a
					href={resolve(`/projects/${projectId}/documents`)}
					class={['nav-button', active == 'documents' && 'active']}
					title="Documents List"
					data-sveltekit-preload-data="off"
					><span class="long-label">Documents</span><span class="short-label">/Docs</span></a
				>
				<a
					href={resolve(`/projects/${projectId}/simulations`)}
					class={['nav-button', active == 'simulations' && 'active']}
					title="Simulations List"
					data-sveltekit-preload-data="off"
					><span class="long-label">Simulations</span><span class="short-label">/Sims</span></a
				>
				<a
					href={resolve(`/projects/${projectId}/settings`)}
					class={['nav-button', active == 'settings' && 'active']}
					title="Simulations List"
					data-sveltekit-preload-data="off"
					><span class="long-label">Settings</span><span class="short-label">/Ctrl</span></a
				>
			{/if}
		{/if}
	</div>

	<div>
		{#if errors.value.length}
			<section class="error-stack" aria-label="Messages" aria-live="polite">
				<div class="error-stack-header">
					<strong>Messages</strong>
					<button class="error-button" type="button" onclick={discardAllErrors}>Dismiss all</button>
				</div>
				<ol class="error-list">
					{#each errors.value as rawError, index}
						{@const currentError = describeError(rawError)}
						<li class="error" role="alert">
							<div class="error-body">
								<strong>{currentError.title}{currentError.status ? ` ${currentError.status}` : ''}:</strong>
								<span>{currentError.message}</span>
								{#if currentError.detail}
									<small>{currentError.detail}</small>
								{/if}
							</div>
							<div class="error-actions">
								<button class="error-button" type="button" onclick={() => copyError(rawError)}>Copy</button>
								<button class="error-button" type="button" onclick={() => discardError(index)}>Dismiss</button>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</div>

	{#if authState}
		<CurrentAuthState auth={authState} />
	{/if}
</div>

<style>
	h2 {
		font-size: 1.2em;
	}
	.icon {
		width: 1.5em;
		height: 1.5em;
	}

	.short-label {
		display: none;
	}
	.app-bar {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: 0.5ex 1em;
		background: #222;
		color: #fff;
		user-select: none;
		border-top: 0.5ex solid #222;
		border-bottom: 0.5ex solid #222;
	}

	.app-name {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 1ex;
		padding: 0.5ex;
		margin: 0;
		max-width: 35vw;
	}

	.offline-indicator {
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		font-weight: bold;
		grid-column: 1 / span 2;
		grid-row: 1;
		background: #700;
		align-self: stretch;
		justify-self: stretch;
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: center;
		font: inherit;
		color: #fff;
		border: none;
		cursor: pointer;
	}

	@media (hover: hover) {
		.nav-button:hover {
			background: #aaa3;
		}
	}

	.nav-button {
		padding: 1ex 1em;
		max-width: 10vw;
		overflow: hidden;
		text-overflow: ellipsis;
		border-top: 2px solid transparent;
		border-bottom: 2px solid transparent;
	}

	.nav-button.active {
		border-bottom-color: #aca;
	}

	a {
		color: #fff;
		text-decoration: none;
	}

	.error-stack {
		position: fixed;
		top: 3.8rem;
		left: 50%;
		z-index: 20000;
		display: grid;
		width: min(54rem, calc(100vw - 2rem));
		max-height: min(40vh, 24rem);
		transform: translateX(-50%);
		background: #fff8f5;
		border: 1px solid #d3482f;
		border-left: 0.4rem solid #d3482f;
		box-shadow: 0 8px 24px #0003;
		color: #2e1009;
		user-select: text;
	}

	.error-stack-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.75rem 0;
	}

	.error-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0 0.75rem 0.75rem;
		overflow: auto;
		list-style: none;
	}

	.error {
		display: grid;
		gap: 0.5rem;
		padding: 0.65rem 0.75rem;
		background: #ffe7df;
		border: 1px solid #efad9d;
		color: #2e1009;
	}

	.error-body {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.error span {
		overflow-wrap: anywhere;
	}

	.error small {
		color: #5c2318;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}

	.error-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.error-button {
		border: none;
		background: #222;
		color: #fff;
		font: inherit;
		cursor: pointer;
		padding: 0.45rem 0.7rem;
		margin: 0;
	}

	.offline {
		background: #770000;
		border-color: #770000;
	}

	.unknown {
		border-top-color: #aa4400;
	}

	.nav-icon {
		display: block;
		height: 1.1em;
		margin: 0.2ex 0;
		color: #fffe;
	}
	.nav-row {
		margin-right: auto;
		padding: 0 1em;
		display: flex;
		gap: 1ex;
		margin-left: 1em;
		border-left: 1px solid #555;
	}
	@media (max-width: 600px) {
		.nav-row {
			margin-left: 0;
		}
		.titel {
			display: none;
		}
		.long-label {
			display: none;
		}
		.short-label {
			display: initial;
		}

		.nav-button {
			padding: 1ex 0.5ex;
		}
	}
</style>
