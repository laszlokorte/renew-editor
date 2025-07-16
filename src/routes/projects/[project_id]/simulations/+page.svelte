<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { atom } from '$lib/reactivity/atom.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { createSimulation, downloadFile, callJSON } = $derived(data.commands);

	let createFormVisible = $state(false);
	let importing = $state(false);
	let importingDocuments = $state([]);
	let importError = atom(undefined);

	function showCreateForm(evt) {
		evt.preventDefault();

		createFormVisible = true;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="full-page">
	<AppBar title={`Project Fooo Simulations`} projectId={"fooo"} authState={data.authState} connectionState={data.connectionState} />

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
				importError.value = false;
				createSimulation(document_ids, formData.get('main_net_name'), formData.get('formalism'))
					.catch((e) => {
						importError.value = e.message;
					})
					.then(() => {
						importing = false;
					});
			}}
		>
			<h3>Create Simulation</h3>
			{#if importError.value}
				<p style="color: #a00">{importError.value}</p>
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
						<button disabled={importing} type="submit" style="opacity: 1; background: #009;"
							>Create</button
						>
					</p>
				{/await}
			</div>
		</form>
	</Modal>

	<header>
		<div>
			<a href="{base}/projects/fooo" title="Back">Back</a>

			<h2>Simulations</h2>
		</div>

		<div class="button-group">
			<form onsubmit={showCreateForm}>
				<button type="submit">New Simulation&hellip;</button>
			</form>
		</div>
	</header>

	<div class="scrollable">
		<div class="title">
			<strong>Id</strong>
		</div>

		<LiveResource socket={data.live_socket} resource={data.simulations}>
			{#snippet children(simulations, _presence, { dispatch, cast })}
				<ul>
					{#each simulations.value.items as sim (sim.id)}
						<li class="list-item">
							<a
								class="list-link"
								href="{base}/simulations/{sim.id}/observer"
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
										}}>Stop</button
									>
								{:else}
									<button
										type="button"
										class="action-confirm"
										onclick={(evt) => {
											evt.preventDefault();
											cast('start', { id: sim.id });
										}}>Start</button
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
		background: #fff;
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
		background: #23875d;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1ex 1em 1ex 1.5em;
	}

	header.offline {
		background: #70030d;
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
			background: #fafafa;
		}
	}

	a {
		color: inherit;
	}

	button {
		background: #0005;
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
			background: #0004;
		}

		button:not(:disabled):active {
			background: #0007;
		}
	}

	.button-group {
		display: flex;
		flex-direction: row;
		align-items: baseline;
		gap: 1ex;
	}

	.button-group-text {
		padding: 0 1em;
	}

	button:focus-visible {
		outline: 2px solid #00aaff;
	}

	dl button {
		border: 0;
		background: #333;
		color: #fff;
		font: inherit;
		padding: 1ex;
		cursor: pointer;
	}

	.upload-form {
		margin: 0;
	}

	.help {
		text-decoration: underline;
		text-decoration-style: dotted;
		cursor: help;
	}

	.drop-zone {
		border: 0.25ex dashed currentColor;
		display: grid;
		place-items: center;
		place-content: center;
		align-self: stretch;
		justify-self: stretch;
		padding: 1em;
		font-size: 1.5em;
		color: #aaa;
	}

	.drop-zone input {
		display: none;
	}

	.drop-zone.invitation {
		color: #ffcc00;
		background: #fffeed;
	}

	.drop-zone.ready {
		color: #00bb55;
		background: #efe;
	}

	.labeled-ruler {
		display: flex;
		flex-direction: row;
		justify-items: stretch;
		align-items: center;
		gap: 1em;
		font-style: italic;
	}

	.labeled-ruler::before {
		content: ' ';
		border-bottom: 1px solid #ccc;
		height: 0;
		flex-grow: 1;
	}
	.labeled-ruler::after {
		content: ' ';
		border-bottom: 1px solid #ccc;
		height: 0;
		flex-grow: 1;
	}

	.file-selector {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: row;
		gap: 1em;
		padding: 1em;
		margin: auto;
	}

	.center {
		text-align: center;
	}

	.upload-button {
		background: #333;
	}

	.list-item {
		display: grid;
		justify-content: stretch;
		gap: 0.5ex;
		grid-template-columns: 1fr auto auto;
		align-items: stretch;
		align-content: stretch;
	}

	.list-link {
		grid-column: 1 / span 3;
		grid-row: 1;
		touch-action: pan-x pan-y;
	}

	.list-input {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		padding: 1em 2em;
		border: none;
		font: inherit;
	}

	.list-pop {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		margin-right: -1.5ex;
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
	}

	.list-pop-actions {
		grid-column: 2 / span 1;
		grid-row: 1;
		padding: 1ex;
		user-select: none;
		touch-action: pan-x pan-y;
		-webkit-user-select: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
	}

	@media (max-width: 40em) {
		.list-actions {
			grid-column: 1 / span 2;
			grid-row: 2 / span 1;
		}

		.list-details {
			grid-column: 3 / span 1;
			grid-row: 2 / span 1;
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
			background: #a55;
			color: #fff;
		}
	}

	.action-delete:not(:disabled):active {
		background: #a22;
		color: #fff;
	}

	.action-cancel {
		background: transparent;
		color: #900;
	}
	@media (pointer: fine) {
		.action-cancel:not(:disabled):hover {
			background: #fdd;
		}
		.action-cancel:not(:disabled):active {
			background: #faa;
		}
	}

	.action-confirm {
		background: transparent;
		color: #090;
	}
	@media (pointer: fine) {
		.action-confirm:not(:disabled):hover {
			background: #dfd;
		}
		.action-confirm:not(:disabled):active {
			background: #afa;
		}
	}

	@media (pointer: fine) {
		.action-export:not(:disabled):hover {
			background: #333;
			color: #fff;
		}

		.action-export:not(:disabled):active {
			background: #333;
			color: #fff;
		}
	}

	.action-export {
		background: transparent;
		color: #009;
	}
	@media (pointer: fine) {
		.action-export:not(:disabled):hover {
			background: #55e;
			color: #fff;
		}

		.action-export:not(:disabled):active {
			background: #55a;
			color: #fff;
		}
	}

	.action-duplicate {
		background: transparent;
		color: #090;
	}
	@media (pointer: fine) {
		.action-duplicate:not(:disabled):hover {
			background: #5a5;
			color: #fff;
		}

		.action-duplicate:not(:disabled):active {
			background: #2a2;
			color: #fff;
		}
	}

	.warn {
		outline: 3px solid orange;
	}
</style>
