<script>
	import AppBar from '../AppBar.svelte';
	const { data } = $props();

	const { documents, createDocument } = $derived(data);

	/** @type {(evt: SubmitEvent) => void} */
	function onNewDocument(evt) {
		evt.preventDefault()

		createDocument()
	}
</script>

<div class="full-page">
<AppBar authState={data.authState} />


<header>
	<div>
		<a href="/" title="Back">Back</a>

		<h2>Documents</h2>
	</div>


	<form onsubmit={onNewDocument}>
		<button type="submit">New Document</button>
	</form>
</header>

<div class="scrollable">
	<div class="title">
		<strong>Name</strong>
	</div>
	<ul>
		{#each documents as d}
			<li><a href="/documents/{d.id}/editor" title="Document #{d.id}">{d.name}</a></li>
		{/each}
	</ul>
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

	.scrollable {
		overflow: auto;
	}

	.title {
		position: sticky;
		background: #fff;
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
		background: #23875d;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1ex 1em 1ex 1.5em;
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
			background: #fafafa;
		}
	}

	a {
		color: inherit;
	}

	button {
		background: #0005;
		color: #fff;
		padding: 1ex 1em;
		border: none;
		cursor: pointer;
		font: inherit;
	}

	button:hover {
		background: #0004;
	}

	button:active {
		background: #0007;
	}
</style>