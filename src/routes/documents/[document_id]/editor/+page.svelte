<script>
	import Canvas from '$lib/components/canvas/Canvas.svelte'

	const {data} = $props()
</script>

<header>
	<a href="/documents" title="Back">Back</a>

	<h2>Edit: {data.document.name} </h2>
</header>

<div class="toolbar">Tools</div>

<div class="full–page">
	<Canvas />
</div>

<style>
	.full–page {
		position: fixed;
		inset: 0;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		z-index: -1;
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
	}

	a {
		color: inherit;
	}
</style>