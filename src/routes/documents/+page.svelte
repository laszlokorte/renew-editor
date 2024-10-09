<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';

	const { data } = $props();

	const createDocument = $derived(data.createDocument);

	let uploadFormVisible = $state(false);
	let online = $state(true);

	/** @type {(evt: SubmitEvent) => void} */
	function onNewDocument(evt) {
		evt.preventDefault();

		createDocument();
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
	}

	let draggingZone = $state(false);
	function onDragEnterZone(evt) {
		evt.preventDefault();
		draggingZone = true;
	}

	function onDragLeaveZone(evt) {
		evt.preventDefault();
		draggingZone = false;
	}

	function onDropZone(evt) {
		evt.preventDefault();
		draggingZone = false;
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
			<input type="file" />
		</label>

		<div class="labeled-ruler">or</div>

		<form class="upload-form">
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
			{#snippet children(documents)}
				<ul>
					{#each documents as d}
						<li><a href="{base}/documents/{d.id}/editor" title="Document #{d.id}">{d.name}</a></li>
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

	button:not(:disabled):hover {
		background: #0004;
	}

	button:not(:disabled):active {
		background: #0007;
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
</style>
