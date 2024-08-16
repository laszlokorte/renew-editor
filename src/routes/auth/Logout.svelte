<script>
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
</script>


<form style="border: 1px solid red" onsubmit={evt => {
		evt.preventDefault()

		localStorage.removeItem("authed")

		goto("/", {invalidateAll: true});
	}}>
	<button>Logout</button>
</form>