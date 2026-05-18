<script>
	import { resolve } from '$app/paths';
	import AppBar from '../AppBar.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { createProject, downloadFile } = $derived(data.commands);

	let online = $state(true);
	let renamingId = $state(null);
	let renamingNewName = $state();
	let renamingOrigName = $state();

	/** @type {(evt: SubmitEvent) => void} */
	function onNewProject(evt) {
		evt.preventDefault();

		createProject(null, false).then(({ id, content: { name } }) => {
			renamingId = id;
			renamingOrigName = name;
			renamingNewName = name;
		});
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="full-page">
	<AppBar
		active="projects"
		title={`Projects`}
		authState={data.authState}
		connectionState={data.connectionState}
	/>

	<header class={{ offline: !online }}>
		<div>
			<a href={resolve('/')} title="Back">Back</a>

			<h2>
				<img src={resolve('/icon-project.svg')} class="icon" alt="" />
				Projects
			</h2>
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
	<div></div>
	<div class="scrollable">
		<div class="title">
			<strong>Name</strong>
		</div>

		{#await data.invitations then inv}
			<LiveResource socket={data.live_socket} resource={inv}>
				{#snippet children(invitations, _presence, { dispatch })}
					{#each invitations.value.items as invitation}
						<li
							class="invitation-list-item"
							style:--background-image="url({resolve('/icon-project.svg')})"
						>
							<span class="invitation-name" title="Project #{invitation.project_id}">
								<strong>Invitation:</strong>
								{invitation.project_name}
							</span>
							<div class="invitation-actions">
								<button
									class="action-duplicate"
									onclick={() => {
										dispatch('accept', {
											project_id: invitation.project_id,
											invitation_id: invitation.id
										});
									}}>Accept</button
								>
								<button
									class="action-delete"
									onclick={() => {
										dispatch('reject', {
											project_id: invitation.project_id
										});
									}}>Reject</button
								>
							</div>
						</li>
					{/each}
				{/snippet}
			</LiveResource>
		{/await}
		<LiveResource socket={data.live_socket} resource={data.projects}>
			{#snippet children(projects, _presence, { dispatch })}
				{#if projects.value.items.length == 0}
					<div style="padding: 2em; text-align: center;">No Projects yet</div>
				{/if}
				<ul>
					{#each projects.value.items as d (d.id)}
						<li
							class="project-list-item"
							style:--background-image="url({resolve('/icon-project.svg')})"
						>
							{#if renamingId == d.id}
								<button
									onclick={() => {
										renamingId = null;
										renamingNewName = null;
									}}
									class="backdrop"
								>
									Cancel
								</button>
								<form
									style="display: contents; "
									onsubmit={(evt) => {
										evt.preventDefault();
										dispatch('rename_project', { id: d.id, name: renamingNewName }).then(() => {
											renamingId = null;
											renamingNewName = null;
										});
									}}
								>
									<div
										style="display: grid; grid-template-columns: 1fr auto;flex-grow: 1; z-index: 100;background-color: #fff;"
										class="project-list-pop"
									>
										<input
											id="rename_{renamingId}"
											bind:value={renamingNewName}
											autocomplete="off"
											use:autofocusIf={{ focus: true, select: true }}
											class={{ 'project-list-input': true, warn: renamingOrigName !== d.name }}
											type="text"
											onkeydown={(evt) => {
												if (evt.key === 'Escape') {
													renamingId = null;
													renamingNewName = null;
												}
											}}
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
									data-sveltekit-preload-data="off"
									href={resolve(`/projects/${d.id}/documents`)}
									title="Project #{d.id}"
								>
									{d.name}</a
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
		grid-template-rows: auto auto auto;
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

	.help {
		text-decoration: underline;
		text-decoration-style: dotted;
		cursor: help;
	}

	.project-list-item {
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

	.project-list-link {
		grid-column: 1 / span 2;
		grid-row: 1;
		touch-action: pan-x pan-y;
		padding-left: 5em;
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		background-image: var(--background-image);
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
		-webkit-appearance: none;
		appearance: none;
		padding-left: 5em;
		background-repeat: no-repeat;
		background-position: 2em center;
		background-size: 1.5em 1.5em;
		background-image: var(--background-image);
	}

	.project-list-pop {
		grid-column: 1 / span 1;
		grid-row: 1;
		box-sizing: border-box;
		margin-right: -1.5ex;
		background: inherit;
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
	.invitation-list-item {
		background-color: #ffffee;
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

	.invitation-name {
		grid-column: 1 / span 2;
		grid-row: 1;
		touch-action: pan-x pan-y;
		padding-left: 5em;
		background-image: var(--background-image);
		color: #000;
	}
	.invitation-actions {
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
