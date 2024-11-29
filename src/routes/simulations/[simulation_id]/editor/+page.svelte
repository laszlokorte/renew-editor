<script>
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import AppBar from '../../../AppBar.svelte';
	import Modal from '$lib/components/modal/Modal.svelte';
	import LiveResource from '$lib/components/live/LiveResource.svelte';
	import { autofocusIf } from '$lib/reactivity/bindings.svelte';

	const { data } = $props();

	const { _ } = $derived(data.commands);
</script>

<div class="full-page">
	<AppBar authState={data.authState} />

	<LiveResource socket={data.live_socket} resource={data.simulation}>
		{#snippet children(simulation, _presence, { dispatch })}
			<header class="header">
				<div class="header-titel">
					<a href="{base}/simulations" title="Back" class="nav-link">Back</a>

					<h2>Simulation: {simulation.value.name}</h2>
				</div>
			</header>
			<pre style="max-width: 100%; white-space: pre-wrap;">{JSON.stringify(
					simulation,
					null,
					'  '
				)}</pre>
		{/snippet}
	</LiveResource>
</div>

<style>
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
</style>
