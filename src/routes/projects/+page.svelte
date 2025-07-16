<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { createProject, downloadFile } = $derived(data.commands);

	let uploadFormVisible = $state(false);
	let online = $state(true);
	let renamingId = $state(null);
	let renamingNewName = $state();
	let renamingOrigName = $state();
	let filesToUpload = $state();

	/** @type {(evt: SubmitEvent) => void} */
	function onNewProject(evt) {
		evt.preventDefault();

		createProject().then(({ id, content: { name } }) => {
			renamingId = id;
			renamingOrigName = name;
			renamingNewName = name;
		});
	}

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="full-page"
>
	<AppBar title={`Projects`} authState={data.authState} connectionState={data.connectionState} />

	<header class:offline={!online}>
		<div>
			<a href="{base}/" title="Back">Back</a>

			<h2>Projects</h2>
		</div>

		<div class="button-group">
			{#if !online}
				<div class="button-group-text">
					<span class="help" title="Connection to sever has been lost">Disconnected</span>
				</div>
			{/if}

			<form onsubmit={onNewProject}>
				<button disabled={!online} type="submit">New Project</button>
			</form>

		</div>
	</header>

	<div class="scrollable">
		<div class="title">
			<strong>Name</strong>
		</div>

		<LiveResource socket={data.live_socket} resource={data.projects}>
			{#snippet children(projects, _presence, { dispatch })}
				<ul>
					{#each projects.value.items as d (d.id)}
						<li class="project-list-item">
							{#if renamingId == d.id}
								<div
									onclick={() => {
										renamingId = null;
										renamingNewName = null;
									}}
									style="background:#0005;position: absolute; left:0;right:0;bottom:0;top: 0;"
								></div>
								<form
									style="display: contents;"
									onsubmit={(evt) => {
										evt.preventDefault();
										dispatch('rename_project', { id: d.id, name: renamingNewName }).then(() => {
											renamingId = null;
											renamingNewName = null;
										});
									}}
								>
									<div
										style="display: grid; grid-template-columns: 1fr auto;flex-grow: 1; z-index: 100;background: #fff;"
										class="project-list-pop"
									>
										<input
											id="rename_{renamingId}"
											bind:value={renamingNewName}
											autocomplete="off"
											use:autofocusIf={{ focus: true, select: true }}
											class="project-list-input"
											type="text"
											onkeydown={(evt) => {
												if (evt.key === 'Escape') {
													renamingId = null;
													renamingNewName = null;
												}
											}}
											class:warn={renamingOrigName !== d.name}
										/>
										<div class="project-list-pop-actions">
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
									<div class="project-list-actions">
										<button
											class="action-export"
											onclick={() => {
												downloadFile(d.links.export.href, d.name);
											}}>Download</button
										>
										<button
											class="action-duplicate"
											onclick={() => {
												dispatch('duplicate_project', { id: d.id });
											}}>Duplicate</button
										>
										<button
											class="action-delete"
											onclick={() => {
												dispatch('delete_project', { id: d.id });
											}}>Delete</button
										>
									</div>
								</form>
							{:else}
								<a
									class="project-list-link"
									href="{base}/projects/{d.id}/documents"
									title="Project #{d.id}">{d.name}</a
								>
								<div class="project-list-actions">
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
										}}>Download</button
									>
									<button
										class="action-duplicate"
										onclick={() => {
											dispatch('duplicate_project', { id: d.id });
										}}>Duplicate</button
									>
									<button
										class="action-delete"
										onclick={() => {
											dispatch('delete_project', { id: d.id });
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

	.drop-zone.invitation * {
		pointer-events: none;
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

	.project-list-item {
		display: grid;
		justify-content: stretch;
		gap: 0.5ex;
		grid-template-columns: 1fr auto;
		align-items: center;
		align-content: stretch;
	}

	.project-list-link {
		grid-column: 1 / span 2;
		grid-row: 1;
		touch-action: pan-x pan-y;
	}

	.project-list-input {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		padding: 1em 2em;
		border: none;
		font: inherit;
	}

	.project-list-pop {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		margin-right: -1.5ex;
	}

	.project-list-actions {
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

	.project-list-pop-actions {
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
		.project-list-actions {
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
