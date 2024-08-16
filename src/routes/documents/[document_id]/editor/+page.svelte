<script>
	import AuthState from '../../../auth/AuthState.svelte'

	export let data;
</script>

<AuthState />

<a href="/documents" title="Back">Back</a>

<h2>Document {data.document.id}</h2>
