export default (() => {
	const isBrowser = typeof localStorage !== "undefined"
	let currentValue = $state(isBrowser && localStorage.getItem("authed"))

	if(isBrowser) {
		window.addEventListener('storage', onChange)
	}

	function onChange(evt) {
		if(evt.key === "authed") {
			currentValue = evt.newValue
		}
	}

	return {
		set token(authData) {
			currentValue = authData
			if(currentValue) {
				localStorage.setItem("authed", authData)
			} else {

				localStorage.removeItem("authed")
			}
		},
		get token() {
			return currentValue
		},
		get isAuthenticated() {
			return !!this.token
		},
		set isAuthenticated(v) {
			if(!v) {
				this.token = null
			}
		}
	}
})()