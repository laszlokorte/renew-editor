
import { Socket } from "phoenix";

function tryParse(str) {
	try {
		return JSON.parse(str)
	} catch(_) {
		return null
	}
}

export default (() => {
	const isBrowser = typeof localStorage !== "undefined"
	let currentValue = $state(isBrowser && tryParse(localStorage.getItem("authed")))

	if(isBrowser) {
		window.addEventListener('storage', onChange)
	}

	function onChange(evt) {
		if(evt.key === "authed") {
			currentValue = JSON.parse(evt.newValue)
		}
	}

	return {
		set value(authData) {
			currentValue = authData
			if(currentValue) {
				localStorage.setItem("authed", JSON.stringify(authData))
			} else {
				localStorage.removeItem("authed")
			}
		},
		get value() {
			return currentValue
		},
		login(token) {
			this.value = token
		},
		logout() {
			this.value = null
		},
		get authHeader() {
			return `Bearer ${currentValue.token}`
		},
		get isAuthenticated() {
			return !!currentValue
		},
		get routes() {
			return this.value.routes
		},
		createSocket() {
			if(currentValue && currentValue.token) {
				return new Socket(this.value.routes.live_socket.href, {params: {token: currentValue.token}})
			} else {
				return null
			}
		}
	}
})()