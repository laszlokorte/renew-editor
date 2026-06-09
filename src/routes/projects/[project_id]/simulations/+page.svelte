<script>
	import { resolve } from '$app/paths';
	import AppBar from '../../../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { atom, update } from '$lib/reactivity/atom.svelte';
	import { describeError } from '$lib/errors';

	const { data } = $props();
	const { project } = data;

	const { createSimulation, downloadFile, callJSON } = $derived(data.commands);

	let createFormVisible = $state(false);
	let importing = $state(false);
	let importingDocuments = $state([]);
	let importError = atom(undefined);
	const liveErrors = atom([]);

	function showCreateForm(evt) {
		evt.preventDefault();

		createFormVisible = true;
	}

	function liveErrorSignature(error) {
		const currentError = describeError(error);
		return JSON.stringify([
			currentError.status,
			currentError.title,
			currentError.message,
			currentError.detail
		]);
	}

	function groupLiveErrors(errors) {
		const groups = new Map();

		for (const rawError of errors) {
			const error = describeError(rawError);
			const signature = liveErrorSignature(rawError);
			const existing = groups.get(signature);

			if (existing) {
				existing.count += 1;
			} else {
				groups.set(signature, { signature, error, count: 1 });
			}
		}

		return [...groups.values()];
	}

	function formatLiveError(error) {
		return [error.title, error.message, error.detail].filter(Boolean).join('\n\n');
	}

	function copyLiveError(error) {
		navigator.clipboard?.writeText(formatLiveError(error));
	}

	function discardLiveError(signature) {
		update((errors) => errors.filter((error) => liveErrorSignature(error) !== signature), liveErrors);
	}

	function discardAllLiveErrors() {
		liveErrors.value = [];
	}
</script>

<div class="full-page">
	<AppBar
		active="simulations"
		title="Project {project.name} Simulations"
		projectId={project.id}
		authState={data.authState}
		connectionState={data.connectionState}
	/>

	<Modal bind:visible={createFormVisible} canClose={!importing} closeLabel="Cancel">
		<form
			disabled={importing}
			class="upload-form"
			onsubmit={(evt) => {
				evt.preventDefault();
				if (importing) {
					return;
				}
				const formData = new FormData(evt.currentTarget);
				const document_ids = formData.getAll('document_ids');
				importing = true;
				importError.value = undefined;
				createSimulation(document_ids, formData.get('main_net_name'), formData.get('formalism'))
					.catch((e) => {
						importError.value = describeError(e, 'Simulation could not be created');
					})
					.then(() => {
						importing = false;
					});
			}}
		>
			<h3>Create Simulation</h3>
			{#if importError.value}
				{@const currentImportError = importError.value}
				<div class="form-error" role="alert">
					<strong>{currentImportError.title}</strong>
					<span>{currentImportError.message}</span>
					{#if currentImportError.detail}
						<p>{currentImportError.detail}</p>
					{/if}
				</div>
			{/if}
			<div>
				{#if importing}
					<p>Compiling...</p>
				{/if}
				{#await Promise.all([data.documents, data.formalisms.catch((e) => [])])}
					Loading...
				{:then [docs, formalisms]}
					<p>
						<label>
							Net Documents:<br />
							(Select the Documents to compose into a shadow net system.)<br />
							<select
								bind:value={importingDocuments}
								multiple
								name="document_ids"
								required
								size="10"
								style="width: 100%; box-sizing: border-box;"
							>
								{#each docs.content.items as doc (doc.id)}
									<option value={doc.id}>{doc.name}</option>
								{/each}
							</select>
						</label>
					</p>

					<p>
						<label>
							Main Name<br />
							(The net to initialize the simulation with)<br />
							<select
								style="min-width: 10em; display: block; width: 100%; padding: 1ex"
								name="main_net_name"
								required
							>
								{#each docs.content.items as doc (doc.id)}
									{#if importingDocuments.indexOf(doc.id) > -1}
										<option value={doc.name}>{doc.name}</option>
									{/if}
								{/each}
							</select>
						</label>
					</p>

					<p>
						<label>
							Formalism<br />
							{#if !formalisms.length}
								Error loading formalisms...
							{/if}
							<select
								style="min-width: 10em; display: block; width: 100%; padding: 1ex"
								name="formalism"
								required
							>
								{#each formalisms as { id, label } (id)}
									<option value={id}>{label}</option>
								{:else}
									<option disabled value="">Error loading formalisms</option>
								{/each}
							</select>
						</label>
					</p>
					<p>
						<button disabled={importing} type="submit" style="opacity: 1; background-color: #009;"
							>Create</button
						>
					</p>
				{/await}
			</div>
		</form>
	</Modal>

	<header>
		<div>
			<a href={resolve('/projects')} title="Back" data-sveltekit-preload-data="off">Back</a>

			<h2>
				<img src={resolve('/icon-simulation.svg')} class="icon" alt="" />
				Simulations
			</h2>
		</div>

		<div class="button-group">
			<form onsubmit={showCreateForm}>
				<button type="submit">New Simulation&hellip;</button>
			</form>
		</div>
	</header>

	{#if liveErrors.value.length}
		<section class="simulation-errors" aria-label="Simulation messages" aria-live="polite">
			<div class="simulation-errors-header">
				<strong>Simulation messages</strong>
				<button class="simulation-error-button" type="button" onclick={discardAllLiveErrors}>
					Dismiss all
				</button>
			</div>
			<ol class="simulation-error-list">
				{#each groupLiveErrors(liveErrors.value) as item (item.signature)}
					<li class="simulation-error" role="alert">
						<div class="simulation-error-body">
							<div class="simulation-error-title">
								<strong>{item.error.title}</strong>
								{#if item.count > 1}
									<span class="simulation-error-count">{item.count}x</span>
								{/if}
							</div>
							<span>{item.error.message}</span>
							{#if item.error.detail}
								<p class="simulation-error-detail">{item.error.detail}</p>
							{/if}
						</div>
						<div class="simulation-error-actions">
							<button
								class="simulation-error-button"
								type="button"
								onclick={() => copyLiveError(item.error)}
							>
								Copy
							</button>
							<button
								class="simulation-error-button"
								type="button"
								onclick={() => discardLiveError(item.signature)}
							>
								Dismiss
							</button>
						</div>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<div class="scrollable">
		<div class="title">
			<strong>Id</strong>
		</div>

		<LiveResource socket={data.live_socket} resource={data.simulations} errors={liveErrors}>
			{#snippet children(simulations, _presence, { dispatch, cast })}
				{#if simulations.value.items.length == 0}
					<div style="padding: 2em; text-align: center;">No Simulations yet</div>
				{/if}
				<ul>
					{#each simulations.value.items as sim (sim.id)}
						<li class="list-item" style:--background-image="url({resolve('/icon-simulation.svg')})">
							<a
								class="list-link"
								href={resolve(`/simulations/${sim.id}/observer`)}
								title="Simulation #{sim.id}">{sim.id}</a
							>
							<div class="list-details">
								<div>
									Main Net: {sim.label}
								</div>
								<div>
									Current Timestep: {sim.content.timestep}
								</div>
							</div>
							<div class="list-actions">
								{#if sim.content.running}
									<button
										type="button"
										class="action-export"
										onclick={(evt) => {
											evt.preventDefault();
											cast('stop', { id: sim.id });
										}}>Terminate</button
									>
								{:else}
									<button
										type="button"
										class="action-confirm"
										onclick={(evt) => {
											evt.preventDefault();
											cast('start', { id: sim.id });
										}}>Initialize</button
									>
								{/if}
								<button
									type="button"
									class="action-export"
									onclick={(evt) => {
										evt.preventDefault();
										downloadFile(sim.links.shadow_net_compiled.href, `${sim.id}.sns`);
									}}>Download SNS</button
								>

								<button
									class="action-duplicate"
									onclick={() => {
										callJSON(sim.links.duplicate);
									}}>Duplicate</button
								>
								<button
									type="button"
									class="action-delete"
									onclick={(evt) => {
										evt.preventDefault();
										cast('delete', { id: sim.id });
									}}>Delete</button
								>
							</div>
						</li>
					{/each}
				</ul>
			{/snippet}
		</LiveResource>
	</div>
</div>

<style>
	.full-page {
		position: fixed;
		inset: 0;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		z-index: -1;
		grid-template-rows: auto auto;
		grid-auto-rows: 1fr;
	}

	.scrollable {
		overflow: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}

	.title {
		position: sticky;
		background-color: #fff;
		top: 0;
		left: 0;
		display: block;
		padding: 1ex 2em;
		border-bottom: 1px solid #eee;
	}

	h2 {
		margin: 0;
	}

	header {
		background-color: #23875d;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1ex 1em 1ex 1.5em;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		border-top: 1px solid #eee;
		color: #23875d;
	}

	li {
		border-bottom: 1px solid #eee;
	}

	li > a {
		display: block;
		padding: 1em 2em;

		&:hover {
			background-color: #fafafa;
		}
	}

	a {
		color: inherit;
	}

	button {
		background-color: #0005;
		color: #fff;
		padding: 1ex 1em;
		border: none;
		font: inherit;
	}
	button:disabled {
		color: #fff8;
	}

	button:not(:disabled) {
		cursor: pointer;
	}

	@media (pointer: fine) {
		button:not(:disabled):hover {
			background-color: #0004;
		}

		button:not(:disabled):active {
			background-color: #0007;
		}
	}

	.button-group {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 1ex;
	}

	button:focus-visible {
		outline: 2px solid #00aaff;
	}

	.upload-form {
		margin: 0;
	}

	.form-error {
		display: grid;
		gap: 0.35rem;
		margin: 0 0 1rem;
		padding: 0.65rem 0.75rem;
		background: #ffe7df;
		border: 1px solid #d3482f;
		border-left: 0.4rem solid #d3482f;
		color: #2e1009;
		user-select: text;
		-webkit-user-select: text;
	}

	.form-error p {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.simulation-errors {
		position: fixed;
		left: 50%;
		bottom: 1.25rem;
		transform: translateX(-50%);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 0.5rem;
		width: min(42rem, calc(100vw - 2rem));
		max-height: min(45vh, 24rem);
		z-index: 20000;
		pointer-events: auto;
		overflow: hidden;
		background: #fff8f5;
		border: 1px solid #d3482f;
		border-left: 0.4rem solid #d3482f;
		box-shadow: 0 8px 24px #0003;
		scrollbar-width: thin;
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-errors-header {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.75rem 0;
		color: #2e1009;
	}

	.simulation-error-list {
		display: grid;
		gap: 0.5rem;
		min-height: 0;
		margin: 0;
		padding: 0 0.75rem 0.75rem;
		overflow: auto;
		list-style: none;
	}

	.simulation-error {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
		align-items: start;
		padding: 0.65rem 0.75rem;
		background: #ffe7df;
		border: 1px solid #efad9d;
		color: #2e1009;
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-error *,
	.simulation-errors * {
		user-select: text !important;
		-webkit-user-select: text !important;
	}

	.simulation-error-body {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.simulation-error-title {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		min-width: 0;
	}

	.simulation-error-body strong {
		overflow-wrap: anywhere;
	}

	.simulation-error-count {
		padding: 0.05rem 0.35rem;
		background: #d3482f;
		color: white;
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.simulation-error-body span,
	.simulation-error-body p {
		margin: 0;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}

	.simulation-error-detail {
		margin-top: 0.35rem;
		white-space: pre-wrap;
	}

	.simulation-error-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: end;
	}

	.simulation-error-button {
		background: #2f2f2f;
		border: 0;
		color: white;
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		font: inherit;
	}

	.simulation-error-button:hover,
	.simulation-error-button:focus-visible {
		background: #111;
	}

	.list-item {
		display: grid;
		justify-content: stretch;
		gap: 0.5ex;
		grid-template-columns: 1fr auto auto;
		align-items: stretch;
		align-content: stretch;
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
	}

	.list-link {
		grid-column: 1 / span 3;
		grid-row: 1;
		touch-action: pan-x pan-y;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		padding-left: 5em;
	}

	.list-details {
		grid-column: 2 / span 1;
		grid-row: 1;
		padding: 1ex;
		padding-right: 1em;
		user-select: none;
		touch-action: pan-x pan-y;
		-webkit-user-select: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
		background-color: white;
	}

	.list-actions {
		grid-column: 3 / span 1;
		grid-row: 1;
		padding: 1ex;
		padding-right: 1em;
		user-select: none;
		touch-action: pan-x pan-y;
		-webkit-user-select: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
		background-color: white;
	}

	@media (max-width: 50em) {
		.list-actions {
			grid-column: 1 / span 2;
			grid-row: 2 / span 1;
		}

		.list-details {
			grid-column: 3 / span 1;
			grid-row: 2 / span 1;
			white-space: wrap;
			line-break: break;
			width: 100%;
		}

		.list-link {
			grid-column: 1 / span 3;
			grid-row: 1 / span 1;
		}
	}
	.action-delete {
		background: transparent;
		color: #900;
	}
	@media (pointer: fine) {
		.action-delete:not(:disabled):hover {
			background-color: #a55;
			color: #fff;
		}
	}

	.action-delete:not(:disabled):active {
		background-color: #a22;
		color: #fff;
	}

	.action-confirm {
		background: transparent;
		color: #090;
	}
	@media (pointer: fine) {
		.action-confirm:not(:disabled):hover {
			background-color: #dfd;
		}
		.action-confirm:not(:disabled):active {
			background-color: #afa;
		}
	}

	@media (pointer: fine) {
		.action-export:not(:disabled):hover {
			background-color: #333;
			color: #fff;
		}

		.action-export:not(:disabled):active {
			background-color: #333;
			color: #fff;
		}
	}

	.action-export {
		background: transparent;
		color: #009;
	}
	@media (pointer: fine) {
		.action-export:not(:disabled):hover {
			background-color: #55e;
			color: #fff;
		}

		.action-export:not(:disabled):active {
			background-color: #55a;
			color: #fff;
		}
	}

	.action-duplicate {
		background: transparent;
		color: #090;
	}
	@media (pointer: fine) {
		.action-duplicate:not(:disabled):hover {
			background-color: #5a5;
			color: #fff;
		}

		.action-duplicate:not(:disabled):active {
			background-color: #2a2;
			color: #fff;
		}
	}

	.icon {
		width: 1em;
		height: 1em;
		vertical-align: middle;
		opacity: 0.5;
	}
</style>
