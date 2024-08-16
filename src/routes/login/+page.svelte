<script>
	import { goto } from '$app/navigation';

	function login() {
		console.log("x")
		localStorage.setItem("authed", "yes")

		window.location.href = '/'
	}
</script>
<form onsubmit={login}>
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