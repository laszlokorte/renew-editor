<script>
	import LoginForm from '$lib/components/auth/LoginForm.svelte'

	const { data } = $props();
</script>

<LoginForm auth={data.authState} />