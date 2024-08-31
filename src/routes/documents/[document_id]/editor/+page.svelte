<script>
	import { atom } from '$lib/reactivity/atom.svelte';
	import AppBar from '../../../AppBar.svelte';

	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte';
	import Scroller from '$lib/components/scroller/Scroller.svelte';

	const { data } = $props();

	const scrollPosition = atom({ x: 0, y: 0 });

	let errors = $state([]);

	function deleteThisDocument(evt) {
		evt.preventDefault();
		data.deleteAction().catch((e) => {
			errors.push(e.message);
		});
	}

	function causeError(e) {
		errors.push('Some Error');
	}
</script>

<div class="full-page">
	<AppBar authState={data.authState} {errors} />

	<header>
		<div class="header-titel">
			<a href="/documents" title="Back">Back</a>

			<h2>Document: {data.document.name}</h2>
		</div>

		<menu>
			<ol class="menu-bar">
				<li class="menu-bar-item" tabindex="-1">
					File
					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Save</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Rename</button></li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Duplicate</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Download</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Download as...</button>
						</li>
						<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
						<li class="menu-bar-menu-item">
							<button
								class="menu-bar-item-button"
								onclick={deleteThisDocument}
								style="color: #aa0000">Delete</button
							>
						</li>
						<li class="menu-bar-menu-item"><hr class="menu-bar-menu-ruler" /></li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button" onclick={causeError} style="color: #aa0000"
								>Cause Error</button
							>
						</li>
					</ul>
				</li>
				<li class="menu-bar-item" tabindex="-1">
					Edit
					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Undo</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Redo</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Select</button></li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button" style="color: #aa0000">Delete</button>
						</li>
					</ul>
				</li>
				<li class="menu-bar-item" tabindex="-1">
					View

					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Reset Camera</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Zoom in</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Zoom out</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Reset Zoom</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Rotate Clockwise</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Reset Rotation</button>
						</li>
					</ul>
				</li>
				<li class="menu-bar-item" tabindex="-1">
					Simulate
					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Start</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Pause</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Step</button></li>
						<li class="menu-bar-menu-item"><button class="menu-bar-item-button">Stop</button></li>
					</ul>
				</li>
				<li class="menu-bar-item" tabindex="-1">
					Share
					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Share Link</button>
						</li>
					</ul>
				</li>
				<li class="menu-bar-item" tabindex="-1">
					Help
					<ul class="menu-bar-menu">
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Reference</button>
						</li>
						<li class="menu-bar-menu-item">
							<button class="menu-bar-item-button">Website</button>
						</li>
					</ul>
				</li>
			</ol>
		</menu>

		<ul class="presence-list">
			<li class="presence-list-total">2</li>
			<li>
				<svg viewBox="-4 -4 40 40" width="32">
					<circle fill="#2488d1" cx="16" cy="16" r="16" stroke="#fff" stroke-width="2" />
				</svg>
			</li>
			<li>
				<svg viewBox="-4 -4 40 40" width="32">
					<circle fill="#d12488" cx="16" cy="16" r="16" stroke="#fff" stroke-width="2" />
				</svg>
			</li>
		</ul>
	</header>

	<div class="overlay">
		<div class="body">
			<Scroller
				allowOverscroll={atom(false)}
				center={atom(true)}
				extraScrollPadding={atom(true)}
				{scrollPosition}
				contentSize={atom({ x: 0, y: 0 })}
				scrollWindowSize={atom({ x: 0, y: 0 })}
			>
				<SVGViewport {scrollPosition} />
			</Scroller>
		</div>
		<div class="topbar">
			<div class="toolbar">
				<button class="tool-button">Select</button>
				<button class="tool-button">Connect</button>
				<button class="tool-button">Draw</button>
				<hr />
				<select class="attribute-select">
					<option>Font</option>
				</select>
				<select class="attribute-select">
					<option>Stroke</option>
				</select>
				<hr />
				<label class="color-wrapper"><input type="color" name="" value="#ff0066" /></label>
				<label class="color-wrapper"><input type="color" name="" value="#6600ff" /></label>
				<input type="range" name="" style="width: 10em" />
			</div>
		</div>

		<div class="sidebar right">
			<svg class="minimap" width="100" height="70" viewBox="-50 -50 100 100">
				<text fill="currentColor" dominant-baseline="middle" text-anchor="middle">Minimap</text>
			</svg>
			<div class="toolbar vertical">
				Hierarchy
				<hr />
				<input type="search" name="" placeholder="search" />
				<select multiple size="5">
					<option>Transition #1</option>
					<option>Place #1</option>
				</select>
			</div>
		</div>
		<div class="sidebar left">
			<div class="toolbar vertical">
				<small>Create</small>
				<hr />
				<svg class="droppable" viewBox="-4 -4 40 40" width="32">
					<circle fill="#24d188" cx="16" cy="16" r="16" stroke="#047138" stroke-width="2" />
				</svg>
				<svg class="droppable" viewBox="-4 -4 40 40" width="32">
					<rect
						fill="#24d188"
						x="1"
						y="1"
						width="30"
						height="30"
						stroke="#047138"
						stroke-width="2"
					/>
				</svg>
				<hr />
				<svg class="droppable" viewBox="-4 -4 40 40" width="32">
					<text text-anchor="middle" font-size="40" x="16" y="30" font-family="serif">T</text>
				</svg>
			</div>
		</div>
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

	header {
		background: #23875d;
		color: #fff;
		display: flex;
		align-items: end;
		justify-items: start;
		padding: 1ex 1.5em 0;
	}
	menu {
		margin: 0;
	}

	.header-titel {
		padding: 0 0 1ex;
	}

	.menu-bar {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 1ex;
		user-select: none;
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

	h2 {
		margin: 0;
	}

	.overlay {
		z-index: 100;
		display: grid;
		grid-template-columns: [body-start] 0.5ex [top-start left-start] auto [left-end] 1fr[right-start] auto [right-end top-end] 1em [body-end];
		grid-template-rows: [body-start] 0.5ex [top-start] auto [top-end left-start right-start] 1fr auto [left-end right-end] 1em [ body-end];
		gap: 0.5em;
	}

	.body {
		grid-area: body;
		place-self: stretch;
		position: relative;
		display: grid;
		touch-action: none;
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
		justify-items: center;
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
	}

	a {
		color: inherit;
	}

	.minimap {
		border: 1px solid #ffffffaa;
		background: #ffffff66;
		flex-grow: 1;
		width: 100%;
		height: auto;
		display: block;
		box-sizing: border-box;
		color: #aaaa;
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
		box-sizing: border-box;
		font: inherit;
		height: 100%;
		box-sizing: border-box;
		padding: 1ex 1em;
	}

	option {
		font: inherit;
	}

	select option:checked {
		background-color: #23875d;
		background-image: linear-gradient(#23875d, #23875d);
		color: #fff;
	}

	.droppable {
		cursor: move;
	}

	.color-wrapper {
		display: grid;
		align-content: center;
		justify-content: center;
		width: 1.8em;
		height: 1.8em;
		border-radius: 100%;
		border: 2px solid #444;
		background: red;
		padding: 0;
		cursor: pointer;
		grid-template-columns: 100%;
		grid-template-rows: 100%;
		overflow: hidden;
		grid-auto-columns: 1ex;
		grid-auto-rows: 1ex;
		cursor: pointer;
	}

	.color-wrapper > input[type='color'] {
		padding: 0;
		margin: 0;
		outline: none;
		border: none;
		display: block;
		width: 100%;
		height: 100%;
		grid-column-start: -3;
		grid-row-start: -3;
		grid-column-end: 3;
		grid-row-end: 3;
		cursor: pointer;
	}

	.color-wrapper:focus-within {
		outline: 2px solid #23875d;
	}

	.tool-button {
		border: none;
		background: #eee;
		border-radius: 2px;
		color: #000;
		font: inherit;
		padding: 1ex;
		cursor: pointer;
		border: 1px solid #aaa;
	}

	.tool-button:hover {
		background: #f7f7f7;
	}

	.tool-button:active {
		background: #e0e0e0;
	}

	.tool-button:focus-visible {
		outline: 2px solid #23875d;
	}

	.attribute-field {
		background: #eee;
		border-radius: 2px;
		border: 1px solid #aaa;
	}

	.attribute-field:hover {
		background: #f7f7f7;
	}

	.attribute-field:active {
		background: #e0e0e0;
	}

	.attribute-field:focus-visible {
		outline: 2px solid #23875d;
	}

	.presence-list {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1.5ex;
		list-style: none;
		padding: 0;
		margin: 0 1em;
		align-self: center;
		margin-left: auto;
		position: relative;
		cursor: default;
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
