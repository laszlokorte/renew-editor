<script>
	import { resolve } from '$app/paths';
	import AppBar from '../../../AppBar.svelte';
	import * as env from '../../../../env';

	import LiveResource from '$lib/components/live/LiveResource.svelte';
	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar
	active="settings"
	title={`Project Settings`}
	projectId={data.project.id}
	authState={data.authState}
	connectionState={data.connectionState}
/>

<section class="hero">
	<LiveResource socket={data.live_socket} resource={data.project}>
		{#snippet children(project, _presence, { dispatch, cast })}
			<h2>
				<img src={resolve('/icon-gear.svg')} class="icon" alt="" />
				Project Settings
				<br />
				<small>Name: {project.value.name}</small>
			</h2>
			<form
				onsubmit={(evt) => {
					evt.preventDefault();

					const formData = new FormData(evt.currentTarget);
					const name = formData.get('project_name');
					dispatch('rename', { name });
				}}
			>
				<fieldset>
					<legend>Rename Project</legend>

					<div class="short-form">
						<label
							><span>Name:</span>
							<input id="project-name" type="text" name="project_name" value={project.value.name} />
						</label>
						<button type="submit" class="action">Rename Project</button>
					</div>
				</fieldset>
			</form>

			<h3>Members</h3>
			<table>
				<thead>
					<tr>
						<th>Role</th>
						<th>E-Mail</th>
						<th width="100%"></th>
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
							<td><span class="role">{mem.role}</span></td>
							<td width="100%">{mem.email}</td>
							<td align="right">
								{#if mem.role != 'owner'}
									<button
										class="action remove"
										onclick={(evt) => {
											evt.preventDefault();
											dispatch('remove_member', { member_id: mem.id });
										}}>Remove from project</button
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<h3>Open Invitations</h3>
			<table>
				<thead>
					<tr>
						<th>Role</th>
						<th width="100%">E-Mail</th>
						<th></th>
					</tr>
				</thead>

				<tbody>
					{#if !project.value.invitations.items.length}
						<tr>
							<td colspan="3" align="center"> No open invitations </td>
						</tr>
					{/if}
					{#each project.value.invitations.items as inv}
						<tr>
							<td><span class="role">{inv.role}</span></td>
							<td width="100%">{inv.email}</td>
							<td align="right"
								><button
									class="action remove"
									onclick={(evt) => {
										evt.preventDefault();
										dispatch('revoke_invitation', { invitation_id: inv.id });
									}}>Revoke</button
								></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
			<form
				onsubmit={(evt) => {
					evt.preventDefault();
					const form = evt.currentTarget;

					const formData = new FormData(form);
					const email = formData.get('email');
					const role = formData.get('role');
					dispatch('invite', { email, role }).then(() => {
						form.reset();
					});
				}}
			>
				<fieldset>
					<legend>Add Editor</legend>

					<div class="short-form">
						<label>
							<span>Role:</span>
							<select name="role">
								<option>reader</option>
								<option>editor</option>
							</select>
						</label>
						<label>
							<span>E-Mail:</span>
							<input name="email" type="email" required />
						</label>
						<button class="action">Invite</button>
					</div>
				</fieldset>
			</form>
		{/snippet}
	</LiveResource>
</section>

<style>
	section {
		margin: 1ex 1.5em;
	}
	table {
		width: 100%;
		max-width: 60em;
	}
	form {
		display: contents;
	}
	fieldset {
		margin-top: 2em;
		width: 100%;
		max-width: 60em;
	}
	th {
		text-align: left;
		border-bottom: 1px solid gray;
	}

	td {
		padding: 0.5ex;
	}
	.hero {
		display: grid;
		justify-content: center;
		justify-items: center;
	}

	.action {
		padding: 1ex;
		background: #444;
		color: #fff;
		text-decoration: none;
		border: none;
		cursor: pointer;
		white-space: nowrap;
	}
	.action:active {
		background: #222;
	}
	.action.remove {
		background-color: #aa0000;
	}
	.icon {
		width: 1em;
		height: 1em;
		vertical-align: middle;
		opacity: 0.5;
	}
	.role {
		background-color: #333;
		color: #fff;
		padding: 4px;
		border-radius: 2px;
	}
	fieldset {
		border: 2px solid #eee;
	}
	legend {
		background-color: #111;
		color: #fff;
		padding: 0.5ex 1ex;
	}
	.short-form {
		display: flex;
		justify-content: stretch;
		align-items: stretch;
		gap: 1ex;
		flex-wrap: wrap;
	}
	.short-form label {
		flex-grow: 1;
		display: flex;
		align-items: baseline;
		gap: 1ex;
	}
	.short-form button,
	.short-form select,
	.short-form input {
		align-self: stretch;
		height: 100%;
		box-sizing: border-box;
	}
	.short-form input {
		align-self: stretch;
		flex-grow: 1;
	}
	.short-form span {
		align-self: center;
	}
</style>
