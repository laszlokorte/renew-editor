<script>
	import { base } from '$app/paths';
	import AppBar from '../../../AppBar.svelte';
	import * as env from '../../../../env';

	const appTitle = env.APP_NAME;

	const { data } = $props();
</script>

<AppBar title={`Project Settings`} projectId={"fooo"} authState={data.authState} connectionState={data.connectionState} />

<section class="hero">

	<h2>Settings</h2>

	<fieldset>
		<legend>Rename Project</legend>

		<input type="text" />
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
			<tr>
				<td>foo@bar.de</td>
				<td>Editor</td>
				<td><button>Remove from project</button></td>
			</tr>
		</tbody>
	</table>

	<h3>Invite for Collaboration</h3>

	<fieldset>
		<legend>Add Editor</legend>

		<input type="text" />
		<button>Invite</button>
	</fieldset>

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
</style>
