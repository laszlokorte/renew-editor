<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { project } = data;
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
		title="Project {project.name} Documents"
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

	<header class={{ offline: !online }}>
		<div>
			<a href="{base}/projects" title="Back">Back</a>

			<h2>
				<img src="{base}/icon-document.svg" class="icon" alt="" />
				Documents
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
				{#if documents.value.items.length == 0}
					<div style="padding: 2em; text-align: center;">No Documents yet</div>
				{/if}
				<ul>
					{#each documents.value.items as d (d.id)}
						<li class="document-list-item" style:--background-image="url({base}/icon-document.svg)">
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
										dispatch('rename_document', { id: d.id, name: renamingNewName }).then(() => {
											renamingId = null;
											renamingNewName = null;
										});
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
											class={{ 'document-list-input': true, warn: renamingOrigName !== d.name }}
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
		display: grid;
		justify-content: stretch;
		gap: 0.5ex;
		grid-template-columns: 1fr auto;
		align-items: center;
		align-content: stretch;
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
	}

	.document-list-link {
		grid-column: 1 / span 2;
		grid-row: 1;
		touch-action: pan-x pan-y;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		padding-left: 5em;
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
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		padding-left: 5em;
		-webkit-appearance: none;
		appearance: none;
	}

	.document-list-pop {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		margin-right: -1.5ex;
		background-image: var(--background-image);
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
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

	.document-list-pop-actions {
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
