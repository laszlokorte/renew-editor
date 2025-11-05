<script>
	import { base } from '$app/paths';
	import AppBar from '../../../AppBar.svelte';
	import * as env from '../../../../env';

	import LiveResource from '$lib/components/live/LiveResource.svelte';
	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar
	title={`Project Settings`}
	projectId={data.project.id}
	authState={data.authState}
	connectionState={data.connectionState}
/>

<section class="hero">
	<h2>
		<img src="{base}/icon-gear.svg" class="icon" alt="" />
		Settings
	</h2>

	<LiveResource socket={data.live_socket} resource={data.project}>
		{#snippet children(project, _presence, { dispatch, cast })}
			<fieldset>
				<legend>Rename Project</legend>

				<input type="text" value={project.value.name} />
				<button>Save</button>
			</fieldset>

			<h3>Members</h3>
			<table>
				<thead>
					<tr>
						<th>E-Mail</th>
						<th>Role</th>
						<th></th>
					</tr>
				</thead>

				<tbody>
					{#if !project.value.members.items.length}
						<tr>
							<td colspan="3"> No members yet </td>
						</tr>
					{/if}
					{#each project.value.members.items as mem}
						<tr>
							<td>{mem.email}</td>
							<td>{mem.role}</td>
							<td><button>Remove from project</button></td>
						</tr>
					{/each}
				</tbody>
			</table>

			<h3>Invite for Collaboration</h3>

			<fieldset>
				<legend>Add Editor</legend>

				<input type="text" />
				<button>Invite</button>
			</fieldset>
		{/snippet}
	</LiveResource>
</section>

<style>
	section {
		margin: 1ex 1.5em;
	}

	.hero {
		display: grid;
		justify-content: center;
		justify-items: center;
	}

	.action {
		padding: 1ex;
		background: #333;
		color: #fff;
		text-decoration: none;
	}
	.icon {
		width: 1em;
		height: 1em;
		vertical-align: middle;
		opacity: 0.5;
	}
</style>
