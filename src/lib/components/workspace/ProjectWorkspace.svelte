<script>
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AppBar from '../../../routes/AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { atom } from '$lib/reactivity/atom.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';
	import { describeError } from '$lib/errors';

	const { data } = $props();

	const { project } = data;
	const { createDocument, importDocuments, downloadFile, createSimulation, callJSON } = $derived(
		data.commands
	);
	const requestedFormalismId = $derived(page.url.searchParams.get('formalism') ?? '');
	const requestedSimulationForm = $derived(page.url.searchParams.get('createSimulation') === '1');

	let uploadFormVisible = $state(false);
	let createSimulationFormVisible = $state(false);
	let creatingSimulation = $state(false);
	let simulationDocumentIds = $state([]);
	let simulationCreateError = atom(undefined);
	const online = $derived(!data.offline && data.connectionState.value !== false);
	let renamingId = $state(null);
	let renamingNewName = $state();
	let renamingOrigName = $state();
	let filesToUpload = $state();

	$effect(() => {
		if (requestedSimulationForm || requestedFormalismId) {
			createSimulationFormVisible = true;
		}
	});

	/** @type {(evt: SubmitEvent) => void} */
	function onNewDocument(evt) {
		evt.preventDefault();

		createDocument().then(({ id, content: { name } }) => {
			renamingId = id;
			renamingOrigName = name;
			renamingNewName = name;
		});
	}

	/** @type {(evt: SubmitEvent) => void} */
	function showUploadForm(evt) {
		evt.preventDefault();

		uploadFormVisible = true;
	}

	function showCreateSimulationForm(evt) {
		evt.preventDefault();

		createSimulationFormVisible = true;
	}

	function formalismIsRequested(id) {
		return requestedFormalismId === id;
	}

	function simulationWorkbenchHref(simulation) {
		return resolve(`/projects/${project.id}/workspace/${simulation.id}`);
	}

	let workspaceSortKey = $state('date');
	let workspaceSortDirection = $state('desc');

	function workspaceItemDate(item) {
		return item.updated_at ?? item.inserted_at ?? '';
	}

	function workspaceItemTimestamp(item) {
		const date = workspaceItemDate(item);
		const timestamp = Date.parse(date);
		return Number.isFinite(timestamp) ? timestamp : 0;
	}

	const workspaceDateFormatter = new Intl.DateTimeFormat('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});

	function formatWorkspaceDate(item) {
		const timestamp = workspaceItemTimestamp(item);
		return timestamp ? workspaceDateFormatter.format(new Date(timestamp)) : '';
	}

	function workspaceItems(documents, simulations) {
		return [
			...documents.map((document, index) => ({
				type: 'document',
				id: `document:${document.id}`,
				sortId: document.id,
				title: document.name,
				date: workspaceItemDate(document),
				dateLabel: formatWorkspaceDate(document),
				timestamp: workspaceItemTimestamp(document),
				sourceIndex: index,
				data: document
			})),
			...simulations.map((simulation, index) => ({
				type: 'simulation',
				id: `simulation:${simulation.id}`,
				sortId: simulation.id,
				title: simulation.label,
				date: workspaceItemDate(simulation),
				dateLabel: formatWorkspaceDate(simulation),
				timestamp: workspaceItemTimestamp(simulation),
				sourceIndex: index,
				data: simulation
			}))
		].sort(compareWorkspaceItems);
	}

	function compareText(left, right) {
		return String(left ?? '').localeCompare(String(right ?? ''), undefined, {
			numeric: true,
			sensitivity: 'base'
		});
	}

	function compareWorkspaceTie(left, right) {
		return (
			Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0) ||
			compareText(left.title, right.title) ||
			Number(left.sourceIndex ?? 0) - Number(right.sourceIndex ?? 0) ||
			compareText(left.type, right.type) ||
			compareText(left.sortId, right.sortId)
		);
	}

	function compareWorkspaceItems(left, right) {
		const direction = workspaceSortDirection === 'asc' ? 1 : -1;
		let result;

		switch (workspaceSortKey) {
			case 'title':
				result = compareText(left.title, right.title) || compareWorkspaceTie(left, right);
				break;
			case 'type':
				result =
					compareText(left.type, right.type) ||
					compareText(left.title, right.title) ||
					compareWorkspaceTie(left, right);
				break;
			case 'date':
			default:
				result =
					Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0) ||
					compareWorkspaceTie(left, right);
				break;
		}

		return result * direction;
	}

	let dragging = $state(false);

	function onDragEnter(evt) {
		if (uploadFormVisible) {
			return;
		}

		if (evt.dataTransfer.types.indexOf('Files') < 0) {
			return;
		}

		evt.preventDefault();
		dragging = true;
	}

	function onDragOver(evt) {
		if (uploadFormVisible) {
			return;
		}

		if (evt.dataTransfer.types.indexOf('Files') < 0) {
			return;
		}

		evt.preventDefault();
		dragging = true;
	}

	function onDragLeave(evt) {
		evt.preventDefault();
		if (evt.target === evt.currentTarget) {
			dragging = false;
		}
	}

	function onDrop(evt) {
		evt.preventDefault();
		dragging = false;

		if (!evt.dataTransfer.files.length) {
			return;
		}

		importDocuments(evt.dataTransfer.files).then(() => {
			uploadFormVisible = false;
		});
	}

	let draggingZone = $state(false);
	function onDragEnterZone(evt) {
		evt.preventDefault();

		if (evt.dataTransfer.types.indexOf('Files') < 0) {
			return;
		}

		draggingZone = true;
	}

	function onDragOverZone(evt) {
		evt.preventDefault();

		if (evt.dataTransfer.types.indexOf('Files') < 0) {
			return;
		}

		draggingZone = true;
	}

	function onDragLeaveZone(evt) {
		evt.preventDefault();
		draggingZone = false;
	}

	function onDropZone(evt) {
		evt.preventDefault();
		evt.stopPropagation();
		draggingZone = false;

		if (!evt.dataTransfer.files.length) {
			return;
		}

		importDocuments(evt.dataTransfer.files).then(() => {
			uploadFormVisible = false;
		});
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={['full-page', dragging && !uploadFormVisible && 'dragging']}
	ondragenter={onDragEnter}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<AppBar
		active="documents"
		title="Project {project.name} Workspace"
		projectId={project.id}
		authState={data.authState}
		connectionState={data.connectionState}
	/>

	<Modal bind:visible={uploadFormVisible} closeLabel="Cancel">
		<h2>Upload Renew File</h2>

		<label
			class={{
				'drop-zone': true,
				invitation: dragging,
				ready: draggingZone
			}}
			ondragenter={onDragEnterZone}
			ondragover={onDragOverZone}
			ondragleave={onDragLeaveZone}
			ondrop={onDropZone}
		>
			Drop .rnw File Here
			<input type="file" multiple />
		</label>

		<div class="labeled-ruler">or</div>

		<form
			class="upload-form"
			onsubmit={(evt) => {
				evt.preventDefault();

				importDocuments(filesToUpload).then(() => {
					uploadFormVisible = false;
				});
			}}
		>
			<div class="center">
				<label for="upload_file">Select a file from your device:</label>
			</div>

			<div class="file-selector">
				<input
					accept=".rnw"
					id="upload_file"
					class="text-input"
					type="file"
					name="upload_file"
					required
					bind:files={filesToUpload}
					multiple
				/> <button class="upload-button">Upload</button>
			</div>
		</form>
	</Modal>

	<Modal
		bind:visible={createSimulationFormVisible}
		canClose={!creatingSimulation}
		closeLabel="Cancel"
	>
		<form
			disabled={creatingSimulation}
			class="upload-form"
			onsubmit={(evt) => {
				evt.preventDefault();
				if (creatingSimulation) {
					return;
				}

				const formData = new FormData(evt.currentTarget);
				const document_ids = formData.getAll('document_ids');
				creatingSimulation = true;
				simulationCreateError.value = undefined;
				createSimulation(document_ids, formData.get('main_net_name'), formData.get('formalism'))
					.catch((e) => {
						simulationCreateError.value = describeError(e, 'Simulation could not be created');
					})
					.then(() => {
						creatingSimulation = false;
					});
			}}
		>
			<h2>New Simulation</h2>
			{#if simulationCreateError.value}
				{@const currentImportError = simulationCreateError.value}
				<div class="form-error" role="alert">
					<strong>{currentImportError.title}</strong>
					<span>{currentImportError.message}</span>
					{#if currentImportError.detail}
						<p>{currentImportError.detail}</p>
					{/if}
				</div>
			{/if}
			{#if creatingSimulation}
				<p>Compiling...</p>
			{/if}
			{#await Promise.all([Promise.resolve(data.documents), data.formalisms.catch(() => [])])}
				Loading...
			{:then [docs, formalisms]}
				<p>
					<label>
						Documents<br />
						<select
							bind:value={simulationDocumentIds}
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
						Main net<br />
						<select
							style="min-width: 10em; display: block; width: 100%; padding: 1ex"
							name="main_net_name"
							required
						>
							{#each docs.content.items as doc (doc.id)}
								{#if simulationDocumentIds.indexOf(doc.id) > -1}
									<option value={doc.name}>{doc.name}</option>
								{/if}
							{/each}
						</select>
					</label>
				</p>

				<p>
					<label>
						Formalism<br />
						<select
							style="min-width: 10em; display: block; width: 100%; padding: 1ex"
							name="formalism"
							required
						>
							{#each formalisms as { id, label } (id)}
								<option value={id} selected={formalismIsRequested(id)}>{label}</option>
							{:else}
								<option disabled value="">Error loading formalisms</option>
							{/each}
						</select>
					</label>
				</p>
				<p>
					<button disabled={creatingSimulation} type="submit" class="primary-action">Create</button>
				</p>
			{:catch e}
				<div class="form-error" role="alert">
					<strong>Simulation form could not be loaded</strong>
					<span>{describeError(e).message}</span>
				</div>
			{/await}
		</form>
	</Modal>

	<header class={{ offline: !online }}>
		<div>
			<a href={resolve('/projects')} data-sveltekit-preload-data="off" title="Back">Back</a>

			<h2>
				<img src={resolve('/icon-document.svg')} class="icon" alt="" />
				Workspace
			</h2>
		</div>

		<div class="button-group">
			{#if !online}
				<div class="button-group-text">
					<span class="help" title="Connection to sever has been lost">Disconnected</span>
				</div>
			{/if}

			<form onsubmit={onNewDocument}>
				<button disabled={!online} type="submit">New Document</button>
			</form>

			<form onsubmit={showCreateSimulationForm}>
				<button disabled={!online} type="submit">New Simulation&hellip;</button>
			</form>

			<form onsubmit={showUploadForm}>
				<button disabled={!online} type="submit">Import&hellip;</button>
			</form>
		</div>
	</header>

	<div class="scrollable">
		<LiveResource socket={data.live_socket} resource={data.documents}>
			{#snippet children(documents, _presence, { dispatch })}
				<LiveResource socket={data.live_socket} resource={data.simulations}>
					{#snippet children(simulations, _simulationPresence, { cast })}
						{@const documentItems = documents.value?.items ?? []}
						{@const simulationItems = simulations.value?.items ?? []}
						{@const items = workspaceItems(documentItems, simulationItems)}

						<div class="workspace-list-toolbar">
							<strong>Workspace</strong>
							<label>
								Sort by
								<select bind:value={workspaceSortKey}>
									<option value="date">Date</option>
									<option value="title">Title</option>
									<option value="type">Type</option>
								</select>
							</label>
							<label>
								Order
								<select bind:value={workspaceSortDirection}>
									<option value="desc">Descending</option>
									<option value="asc">Ascending</option>
								</select>
							</label>
						</div>

						{#if items.length == 0}
							<div style="padding: 2em; text-align: center;">Workspace is empty</div>
						{/if}
						<ul class="workspace-list">
							{#each items as item (item.id)}
								{#if item.type === 'document'}
									{@const d = item.data}
									<li
										class="workspace-list-item document-list-item"
										style:--background-image="url({resolve('/icon-document.svg')})"
									>
										<div class="workspace-list-type">Document</div>
										{#if renamingId == d.id}
											<button
												onclick={() => {
													renamingId = null;
													renamingNewName = null;
												}}
												class="backdrop">Cancel</button
											>
											<form
												style="display: contents; "
												onsubmit={(evt) => {
													evt.preventDefault();
													dispatch('rename_document', { id: d.id, name: renamingNewName }).then(
														() => {
															renamingId = null;
															renamingNewName = null;
														}
													);
												}}
											>
												<div
													style="display: grid; grid-template-columns: 1fr auto;flex-grow: 1; z-index: 100;background-color: #fff;"
													class="document-list-pop"
												>
													<input
														id="rename_{renamingId}"
														bind:value={renamingNewName}
														autocomplete="off"
														use:autofocusIf={{ focus: true, select: true }}
														class={{
															'document-list-input': true,
															warn: renamingOrigName !== d.name
														}}
														type="text"
														onkeydown={(evt) => {
															if (evt.key === 'Escape') {
																renamingId = null;
																renamingNewName = null;
															}
														}}
													/>
													<div class="document-list-pop-actions">
														<button class="action-confirm" type="submit">Confirm</button>
														<button
															class="action-cancel"
															onclick={() => {
																renamingId = null;
																renamingNewName = null;
															}}>Cancel</button
														>
													</div>
												</div>
												<div class="document-list-actions">
													<button
														class="action-export"
														onclick={() => {
															downloadFile(d.links.export.href, d.name);
														}}>Export .rnw</button
													>
													<button
														class="action-duplicate"
														onclick={() => {
															dispatch('duplicate_document', { id: d.id });
														}}>Duplicate</button
													>
													<button
														class="action-delete"
														onclick={() => {
															dispatch('delete_document', { id: d.id });
														}}>Delete</button
													>
												</div>
											</form>
										{:else}
											<a
												class="document-list-link"
												data-sveltekit-preload-data="off"
												data-sveltekit-preload-code="eager"
												href={resolve(`/projects/${project.id}/workspace/${d.id}`)}
												title="Document #{d.id}">{d.name}</a
											>
											<div class="workspace-list-date" title={item.date}>{item.dateLabel}</div>
											<div class="document-list-actions">
												<button
													class="action-rename"
													onclick={() => {
														renamingNewName = d.name;
														renamingOrigName = d.name;
														renamingId = d.id;
													}}>Rename</button
												>
												<button
													class="action-export"
													onclick={() => {
														downloadFile(d.links.export.href, d.name);
													}}>Export .rnw</button
												>
												<button
													class="action-duplicate"
													onclick={() => {
														dispatch('duplicate_document', { id: d.id });
													}}>Duplicate</button
												>
												<button
													class="action-delete"
													onclick={() => {
														dispatch('delete_document', { id: d.id });
													}}>Delete</button
												>
											</div>
										{/if}
									</li>
								{:else}
									{@const sim = item.data}
									<li
										class="workspace-list-item simulation-list-item"
										style:--background-image="url({resolve('/icon-simulation.svg')})"
									>
										<div class="workspace-list-type">Simulation</div>
										<a
											class="simulation-list-link"
											href={simulationWorkbenchHref(sim)}
											data-sveltekit-preload-data="off"
											title="Simulation #{sim.id}"
										>
											<span>{sim.label}</span>
											<small>{sim.id}</small>
										</a>
										<div class="workspace-list-date" title={item.date}>{item.dateLabel}</div>
										<div class="simulation-list-details">
											<div>Time: {sim.content.timestep}</div>
											<div>{sim.content.running ? 'running' : 'not running'}</div>
										</div>
										<div class="simulation-list-actions">
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
												type="button"
												class="action-duplicate"
												onclick={(evt) => {
													evt.preventDefault();
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
								{/if}
							{/each}
						</ul>
					{/snippet}
				</LiveResource>
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

	.full-page.dragging * {
		pointer-events: none;
	}

	.full-page.dragging {
		pointer-events: none;
	}

	.full-page.dragging::after {
		content: 'Drop Here';
		font-size: 3vw;
		color: #44aa77;
		display: grid;
		place-content: center;
		place-items: center;
		position: fixed;
		inset: 0;
		border: 1vw solid #88ffaa;
		background-color: #88ffaa33;
		pointer-events: all;
		z-index: 10000;
	}

	.scrollable {
		overflow: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
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

	header.offline {
		background-color: #70030d;
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

	.button-group-text {
		padding: 0 1em;
	}

	button:focus-visible {
		outline: 2px solid #00aaff;
	}

	.upload-form {
		margin: 0;
	}

	.primary-action {
		background-color: #333;
		color: #fff;
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

	.workspace-list-toolbar {
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75ex 2em;
		background-color: #f6f6f6;
		border-bottom: 1px solid #ddd;
		color: #222;
	}

	.workspace-list-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.5ex;
	}

	.workspace-list-toolbar select {
		font: inherit;
		padding: 0.2ex 0.5ex;
	}

	.workspace-list {
		min-width: 60rem;
	}

	.workspace-list-item {
		display: grid;
		grid-template-columns: 7rem 10.5rem minmax(16rem, 1fr) 9rem auto;
		align-items: center;
		gap: 0.5ex;
		border-bottom: 1px solid #eee;
		color: #23875d;
	}

	.workspace-list-type {
		grid-column: 1;
		grid-row: 1;
		padding: 1em 0 1em 2em;
		color: #555;
		user-select: none;
	}

	.workspace-list-date {
		grid-column: 2;
		grid-row: 1;
		padding: 1ex 0.5em;
		color: #555;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		user-select: none;
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
		background-color: #fffeed;
	}

	.drop-zone.invitation * {
		pointer-events: none;
	}

	.drop-zone.ready {
		color: #00bb55;
		background-color: #efe;
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
		background-color: #333;
	}

	.document-list-item {
		justify-content: stretch;
		align-content: stretch;
	}

	.simulation-list-item {
	}

	.simulation-list-link {
		grid-column: 3;
		grid-row: 1;
		display: grid;
		gap: 0.2ex;
		padding: 1em 2em 1em 5em;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		touch-action: pan-x pan-y;
	}

	.simulation-list-link small {
		color: #777;
		font-size: 0.85em;
		overflow-wrap: anywhere;
	}

	.simulation-list-details {
		grid-column: 4;
		grid-row: 1;
		padding: 1ex 1em;
		background-color: #fff;
		color: #333;
		white-space: nowrap;
		user-select: none;
	}

	.simulation-list-actions {
		grid-column: 5;
		grid-row: 1;
		padding: 1ex;
		background-color: #fff;
		user-select: none;
		touch-action: pan-x pan-y;
		-webkit-user-select: none;
	}

	.document-list-link {
		grid-column: 3;
		grid-row: 1;
		touch-action: pan-x pan-y;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		padding-left: 5em;
	}

	.document-list-input {
		grid-column: 3;
		grid-row: 1;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		padding: 1em 2em;
		border: none;
		font: inherit;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		padding-left: 5em;
		-webkit-appearance: none;
		appearance: none;
	}

	.document-list-pop {
		grid-column: 3;
		grid-row: 1;
		box-sizing: border-box;
		margin-right: -1.5ex;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
	}

	.document-list-actions {
		grid-column: 5;
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

	.document-list-pop-actions {
		grid-column: 5;
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
		.workspace-list {
			min-width: 0;
		}

		.workspace-list-toolbar {
			flex-wrap: wrap;
		}

		.workspace-list-item {
			grid-template-columns: auto 1fr;
		}

		.workspace-list-type {
			grid-column: 1;
			grid-row: 1;
			padding-right: 1em;
		}

		.document-list-link,
		.simulation-list-link,
		.document-list-input,
		.document-list-pop {
			grid-column: 2;
		}

		.simulation-list-details {
			grid-column: 2;
			grid-row: 3;
			padding-left: 5em;
		}

		.simulation-list-actions {
			grid-column: 2;
			grid-row: 4;
		}

		.workspace-list-date {
			grid-column: 2;
			grid-row: 2;
			padding: 0 2em 0.5em 5em;
		}

		.document-list-actions {
			grid-column: 2;
			grid-row: 3 / span 1;
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

	.action-cancel {
		background: transparent;
		color: #900;
	}
	@media (pointer: fine) {
		.action-cancel:not(:disabled):hover {
			background-color: #fdd;
		}
		.action-cancel:not(:disabled):active {
			background-color: #faa;
		}
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

	.action-rename {
		background: transparent;
		color: #333;
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

	.warn {
		outline: 3px solid orange;
	}
	.icon {
		width: 1em;
		height: 1em;
		vertical-align: middle;
		opacity: 0.5;
	}
	.backdrop {
		background: #0005;
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		top: 0;
		color: transparent;
		border: none;
		appearance: none;
		opacity: 1;
	}
	.backdrop:active,
	.backdrop:hover,
	.backdrop:focus {
		background-color: #0005 !important;
		opacity: 1;
	}
</style>
