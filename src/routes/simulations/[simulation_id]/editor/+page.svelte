<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';
	import { atom, view, viewCombined } from '$lib/reactivity/atom.svelte';
	import { choice } from 'partial.lenses';
	import { propEq } from 'ramda';

	const { data } = $props();

	const { _ } = $derived(data.commands);

	const currentInstance = atom(null);
</script>

<div class="full-page">
	<AppBar authState={data.authState} />

	<LiveResource socket={data.live_socket} resource={data.simulation}>
		{#snippet children(simulation, presence, { dispatch })}
			{@const nets = view(['shadow_net_system', 'content', 'nets'], simulation)}
			{@const net_instances = view('net_instances', simulation)}
			{@const current_net = viewCombined(
				L.choose(({ currentInstance }) => [
					'net_instances',
					L.find(R.propEq(currentInstance, 'id')),
					'shadow_net_id'
				]),
				{ net_instances, currentInstance }
			)}
			<header class="header">
				<div class="header-titel">
					<a href="{base}/simulations" title="Back" class="nav-link">Back</a>

					<h2>Simulation: {simulation.value.name}</h2>
				</div>

				<menu class="header-menu">
					<ol class="menu-bar">
						<li class="menu-bar-item" tabindex="-1">
							File
							<ul class="menu-bar-menu">
								<li class="menu-bar-menu-item">
									<button
										class="menu-bar-item-button"
										onclick={() => {
											alert('the document is saved automatically');
										}}>Save</button
									>
								</li>
							</ul>
						</li>
					</ol>
				</menu>

				<ul class="presence-list">
					<!--<li class="presence-list-total">{presence.length}</li>-->
					{#each presence.value as p (p.data.username)}
						<li>
							<svg viewBox="-4 -4 40 40" width="32">
								<title>{p.data.username} ({p.count})</title>
								<circle fill={p.data.color} cx="16" cy="16" r="16" stroke="#fff" stroke-width="2" />
								<text x="16" y="22" text-anchor="middle" font-size="20" fill="#fff"
									>{p.data.username.substr(0, 1)}</text
								>
							</svg>
						</li>
					{/each}
				</ul>
			</header>
			<div class="overlay">
				<div class="topbar">
					<div class="toolbar">
						Net Instance:
						<select bind:value={currentInstance.value}>
							<option value={null}>---</option>

							{#each nets.value as nt}
								{@const this_instances = view(
									L.filter(R.propEq(nt.id, 'shadow_net_id')),
									net_instances
								)}
								<optgroup label={nt.name}>
									{#each this_instances.value as ni}
										<option value={ni.id}>{ni.label}</option>
									{/each}
								</optgroup>
							{/each}
						</select>
					</div>
				</div>

				<div class="body"></div>

				<div class="sidebar right">
					<div class="toolbar vertical">
						<details>
							<summary>Debug Simulation </summary>
							<textarea>{JSON.stringify(simulation, null, '  ')}</textarea>
						</details>

						<details>
							<summary>Debug SNS </summary>

							{#await data.shadow_net_system then sns}
								{@const currentDoc = view(
									(id) => R.find((n) => n.id === id, sns.nets)?.document,
									current_net
								)}
								<textarea> {JSON.stringify(currentDoc.value, null, '  ')}</textarea>
							{/await}
						</details>
					</div>
				</div>

				<div class="sidebar left">
					<div class="toolbar vertical">
						Time: {simulation.value.timestep}

						<button type="button">Step</button>
					</div>
				</div>
			</div>
		{/snippet}
	</LiveResource>
</div>

<style>
	textarea {
		width: 100%;
	}
	.full-page {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		z-index: -1;
		grid-template-rows: auto auto;
		grid-auto-rows: 1fr;
		overflow: hidden;
	}

	.header {
		background: #23875d;
		color: #fff;
		display: grid;
		grid-template-columns: [top-left-start] 1fr [top-left-end right-start] auto [right-end];
		grid-template-rows: [right-start top-left-start] auto [top-left-end bottom-start] auto [right-end bottom-end];
		padding: 1ex 0 0 0;
	}

	.header-menu {
		margin: 0;
		padding: 0 1ex;
		display: block;
		width: 100%;
	}

	.header-titel {
		padding: 0 1.5em 1ex;
		grid-area: top-left;
	}

	.nav-link {
		user-select: none;
	}

	.menu-bar {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 1ex;
		user-select: none;
		max-width: 20vw;
		overflow: visible;
		grid-area: bottom;
	}

	.menu-bar-item {
		position: relative;
		padding: 1.2ex 1em;
	}

	.menu-bar-item {
		cursor: pointer;
	}

	.menu-bar-item:hover {
		background: #0004;
	}

	.menu-bar:focus-within .menu-bar-item:hover {
		background: #fff;
		color: #000;
		box-shadow: 0 -1px 4px -1px #0006;
	}

	.menu-bar-menu {
		pointer-events: all;
		z-index: 10000;
		position: absolute;
		left: 0;
		top: 100%;
		background: #fff;
		color: #000;
		padding: 0;
		list-style: none;
		display: none;
		flex-direction: column;
		gap: 0.25ex;
		padding: 0.5ex;
		min-width: 100%;
		width: max-content;
		box-shadow: 0 6px 10px -6px #0006;
	}

	.menu-bar:focus-within .menu-bar-item:hover > .menu-bar-menu {
		display: flex;
	}

	.menu-bar-menu-item {
		display: flex;
		justify-items: stretch;
		cursor: default;
	}

	.menu-bar-menu-ruler {
		margin: 0.5ex 0;
		border: none;
		border-top: 1px solid #aaa;
	}

	.menu-bar-item-button {
		text-align: left;
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		flex-grow: 1;
		padding: 1ex 4em 1ex 1ex;
	}

	.menu-bar-item-button:hover {
		background: #eee;
	}

	.menu-bar-item-button:disabled {
		opacity: 0.3;
	}

	.menu-bar-item-danger {
		color: #a00;
	}

	h2 {
		margin: 0;
		white-space: nowrap;
		max-width: 80vw;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.body {
		grid-area: body;
		place-self: stretch;
		position: relative;
		display: grid;
		touch-action: none;

		user-select: none;
		-webkit-user-select: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
	}

	.overlay {
		z-index: 100;
		display: grid;
		grid-template-columns:
			[body-start] 0.5ex [top-start left-start] auto [left-end] 1fr[right-start] max(20vw)
			[right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start] 1fr auto [left-end right-end] 1em [body-end];
		gap: 0.5em;
		overflow: hidden;
		width: 100vw;

		contain: strict;
	}

	.topbar {
		grid-area: top;
		align-self: start;
		z-index: 1;
	}

	.toolbar {
		padding: 1em 1em;
		background: #fff;
		box-shadow: 0 0 5px #0003;
		padding: 1em 1em;
		background: #fff;
		box-shadow: 0 0 5px #0003;
		border-radius: 0.5ex;
		z-index: 100;
		display: grid;
		grid-auto-flow: column;
		gap: 1ex;
		align-items: center;
		justify-content: start;
		justify-items: stretch;
		grid-auto-rows: 1fr;
		overflow: auto;
		scrollbar-width: thin;
		user-select: none;
	}

	hr {
		flex-grow: 1;
		flex-shrink: 0;
		flex-basis: 1px;
		align-self: stretch;
		justify-self: stretch;
		flex-basis: 1px;
		margin: 0;
		border: none;
		border-top: 1px solid gray;
		border-left: 1px solid gray;
	}

	.toolbar.vertical {
		grid-auto-flow: row;
		grid-auto-columns: 1fr;
		grid-auto-rows: auto;
	}

	.sidebar {
		align-self: start;
		justify-self: start;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1ex;
		z-index: 1;
	}

	.sidebar.left {
		grid-area: left;
	}

	.sidebar.right {
		grid-area: right;
		justify-self: stretch;
	}

	@media (max-width: 40em) {
		.sidebar.right {
			display: none;
		}
	}

	a {
		color: inherit;
	}

	select {
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
	}

	.attribute-select {
		flex-grow: 1;
		width: 100%;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
		padding: 0.5ex 1em;
		max-width: 10em;
		min-width: 6em;
	}

	.color-swatch {
		box-sizing: border-box;
		padding: 0;
		height: 100%;
		background: none;
		border: none;
		width: auto;
		min-width: 2em;
		aspect-ratio: 1;
	}

	.number-spinner {
		box-sizing: border-box;
		padding: 0.5ex;
		height: 100%;
	}

	option {
		font: inherit;
	}

	select option:checked {
		background-color: #23875d;
		background-image: linear-gradient(#23875d, #23875d);
		color: #fff;
	}

	.presence-list {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1.5ex;
		list-style: none;
		padding: 1ex;
		margin: 0 2em 0 0;
		align-self: center;
		margin-left: auto;
		position: relative;
		cursor: default;
		grid-area: right;
		align-self: end;
	}

	.presence-list-total {
		position: absolute;
		right: -0.75em;
		top: 0;
		bottom: 0.5ex;
		text-align: center;
		flex: flex;
		align-items: center;
		align-content: center;
		color: #fff;
		font-weight: bold;
	}
</style>
