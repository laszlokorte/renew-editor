<script>
	import AppBar from '../../../AppBar.svelte';

	import SVGViewport from '$lib/components/viewport/SVGViewport.svelte'
	import Scroller from '$lib/components/scroller/Scroller.svelte';

	const {data} = $props()
</script>


<div class="full–page">
	<AppBar authState={data.authState} />

	<header>
		<a href="/documents" title="Back">Back</a>

		<h2>Edit: {data.document.name}</h2>
	</header>

	<Scroller>
		<SVGViewport />

		<div class="toolbar">Tools</div>

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
		background: #395c45;
		color: #fff;
		display: grid;
		padding: 1ex 1.5em;
	}

	h2 {
		margin: 0;
	}

	.toolbar {
		padding: 1em 1em;
		background: #fff;
		margin: 0.5em;
		box-shadow: 0 0 5px #0003;
		border-radius: 0.5ex;
		z-index: 100;
		align-self: start;
	}

	a {
		color: inherit;
	}
</style>