<script>
	import {atom} from '$lib/reactivity/atom.svelte'
	import AppBar from '../../../AppBar.svelte';

	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte'
	import Scroller from '$lib/components/scroller/Scroller.svelte';

	const {data} = $props()

	const scrollPosition = atom({x:0,y:0});
</script>


<div class="full–page">
	<AppBar authState={data.authState} />

	<header>
		<a href="/documents" title="Back">Back</a>

		<h2>Document: {data.document.name}</h2>
	</header>

	<Scroller
		allowOverscroll={atom(false)}
		center={atom(true)}
		extraScrollPadding={atom(true)}
		scrollPosition={scrollPosition}
		contentSize={atom({x:0,y:0})}
		scrollWindowSize={atom({x:0,y:0})}
	>
		<SVGViewport {scrollPosition} />

		<div class="overlay">
			<div class="topbar">
				<div class="toolbar">Tools
				<button>x</button>
			</div>
			</div>

			<div class="sidebar right">
				<svg class="minimap" width="100" height="100" viewBox="-50 -50 100 100">
					<text text-anchor="middle">Minimap</text>
				</svg>
				<div class="toolbar">
				<select multiple size="5">
					<option>Test</option>
				</select></div></div>
			<div class="sidebar left">
				<div class="toolbar vertical">
				<svg viewBox="0 0 32 32" width="32">
					<circle cx="16" cy="16" r="16" fill="black" />
				</svg>
				<svg viewBox="0 0 32 32" width="32">
					<rect x="0" y="0" width="32" height="32" fill="black" />
				</svg>
				<hr>
				B
			</div>
			</div>
		</div>

	</Scroller>
</div>

<style>
	.full–page {
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
		display: grid;
		justify-items: start;
		padding: 1ex 1.5em;
	}

	h2 {
		margin: 0;
	}

	.overlay {
		pointer-events: none;
		z-index: 100;
		display: grid;
		grid-template-columns: [top-start left-start] auto [left-end] 1fr[right-start] auto [right-end top-end];
		grid-template-rows: [top-start] auto [top-end left-start right-start] 1fr auto [left-end right-end];
		gap: 0.5em;
		padding: 0.5em;
	}

	.topbar {
		grid-area: top;
		align-self: start;
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
		pointer-events: all;
		display: flex;
		gap: 1ex;
		user-select: all;
		pointer-events: all;
		align-items: center;
	}

	hr {
		flex-grow: 1;
		align-self: stretch;
		justify-self: stretch;
		margin: 0;
		border: none;
		border-top: 1px solid gray;
		border-left: 1px solid gray;
	}

	.toolbar.vertical {
		flex-direction: column;
	}

	.sidebar {
		align-self: start;
		justify-self: start;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1ex;
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
		border: 1px solid #aa000044;
	}

	select {
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
	}
</style>