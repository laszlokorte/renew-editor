<script>
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
</script>
<form onsubmit={(evt) => {
	evt.preventDefault()
	localStorage.setItem("authed", "true")

	goto("/documents", {invalidateAll: true});
}}>
	<dl>
		<dt>API</dt>
		<dd><input type="url" name="" value="https://renewcollab.laszlokorte.de"></dd>
		<dt>User</dt>
		<dd><input type="text" name=""></dd>
		<dt>Password</dt>
		<dd><input type="text" name=""></dd>
		<dt>Actions</dt>
		<dd>
			<button>Login</button>
		</dd>
	</dl>
</form>