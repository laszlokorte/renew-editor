<script>
	const { data } = $props();

	const { documents } = $derived(data);

	/** @type {(evt: SubmitEvent) => void} */
	function onNewDocument(evt) {
		evt.preventDefault()
	}
</script>

<header>
	<div>
		<a href="/" title="Back">Back</a>

		<h2>Documents</h2>
	</div>


	<form onsubmit={onNewDocument}>
		<button type="submit">New Document</button>
	</form>
</header>


<ul>
	{#each documents as d}
		<li><a href="/documents/{d.id}/editor" title="Document #{d.id}">{d.name}</a></li>
	{/each}
</ul>


<style>

	h2 {
		margin: 0;
	}

	header {
		background: #395c45;
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
		color: #395c45;
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
</style>