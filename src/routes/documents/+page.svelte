<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { createDocument, importDocuments, downloadFile } = $derived(data.commands);

	let uploadFormVisible = $state(false);
	let online = $state(true);
	let renamingId = $state(null);
	let renamingNewName = $state();
	let renamingOrigName = $state();
	let filesToUpload = $state();

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

	function onDragLeave(evt) {
		evt.preventDefault();
		dragging = false;
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

	function onDragLeaveZone(evt) {
		evt.preventDefault();
		draggingZone = false;
	}

	function onDropZone(evt) {
		evt.preventDefault();
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
	class="full-page"
	class:dragging={dragging && !uploadFormVisible}
	ondragover={onDragEnter}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<AppBar authState={data.authState} />

	<Modal bind:visible={uploadFormVisible} closeLabel="Cancel">
		<h2>Upload Renew File</h2>

		<label
			class="drop-zone"
			class:invitation={dragging}
			class:ready={draggingZone}
			ondragover={onDragEnterZone}
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

	<header class:offline={!online}>
		<div>
			<a href="{base}/" title="Back">Back</a>

			<h2>Documents</h2>
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

			<form onsubmit={showUploadForm}>
				<button disabled={!online} type="submit">Import&hellip;</button>
			</form>
		</div>
	</header>

	<div class="scrollable">
		<div class="title">
			<strong>Name</strong>
		</div>

		<LiveResource socket={data.live_socket} resource={data.documents}>
			{#snippet children(documents, _presence, { dispatch })}
				<ul>
					{#each documents.value.items as d (d.id)}
						<li class="document-list-item">
							{#if renamingId == d.id}
								<form
									style="display: contents;"
									onsubmit={(evt) => {
										evt.preventDefault();
										dispatch('rename_document', { id: d.id, name: renamingNewName }).then(() => {
											renamingId = null;
											renamingNewName = null;
										});
									}}
								>
									<input
										bind:value={renamingNewName}
										use:autofocusIf={{ focus: true, select: true }}
										class="document-list-input"
										type="text"
										onkeydown={(evt) => {
											if (evt.key === 'Escape') {
												renamingId = null;
												renamingNewName = null;
											}
										}}
										class:warn={renamingOrigName !== d.name}
									/>
									<div class="document-list-actions">
										<button class="action-confirm" type="submit">Confirm</button>
										<button
											class="action-cancel"
											onclick={() => {
												renamingId = null;
												renamingNewName = null;
											}}>Cancel</button
										>
										<button
											class="action-export"
											onclick={() => {
												downloadFile(d.links.export.href, d.name);
											}}>Export</button
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
									href="{base}/documents/{d.id}/editor"
									title="Document #{d.id}">{d.name}</a
								>
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
										}}>Export</button
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
		background: #88ffaa33;
		pointer-events: none;
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

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
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

	.document-list-item {
		display: grid;
		justify-content: stretch;
		gap: 0.5ex;
		grid-template-columns: 1fr auto;
		align-items: center;
		align-content: stretch;
	}

	.document-list-link {
		grid-column: 1 / span 2;
		grid-row: 1;
		touch-action: pan-x pan-y;
	}

	.document-list-input {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		padding: 1em 2em;
		border: none;
		font: inherit;
	}

	.document-list-actions {
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
		.document-list-actions {
			grid-column: 1 / span 2;
			grid-row: 2 / span 1;
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

	.action-rename {
		background: transparent;
		color: #333;
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
