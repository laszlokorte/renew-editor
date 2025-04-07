import { Socket } from "phoenix";
import { fetchJson } from '$lib/api/json'

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
	let lastRefresh = null

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
			if(isBrowser && currentValue) {
				localStorage.setItem("authed", JSON.stringify(authData))
			} else if(isBrowser) {
				localStorage.removeItem("authed")
			}
		},
		get lastRefresh() {
			return lastRefresh
		},
		get value() {
			return currentValue
		},
		login(token) {
			lastRefresh = new Date()
			this.value = token
		},
		logout() {
			this.value = null
		},
		get authHeader() {
			return currentValue ? `Bearer ${currentValue.token}` : null
		},
		get isAuthenticated() {
			return !!currentValue
		},
		get routes() {
			return this.value?.routes ?? []
		},
		refresh(fetchFn) {
			return new Promise((res, rej) => {
				let rootUrl = this.value?.url

				if(rootUrl) {
					fetchJson(fetchFn, rootUrl, "GET").then((protocolJson)=> {
						this.value = {
							...this.value,
							routes: protocolJson.routes,
						}
						lastRefresh = new Date()

						return protocolJson.routes
					}).then((routes) => {
						res(routes)
					}).catch((e) => {
						rej(e)
					})
				} else {
					return Promise.reject("unknown api uil")
				}
			})
		},
		createSocket() {
			if(currentValue && currentValue.token && this.value.routes && this.value.routes.live_socket) {
				return new Socket(this.value.routes.live_socket.href, {
					longPollFallbackMs: null,
					transport: window?.WebSocket,
					params: {token: currentValue.token}
				})
			} else {
				return null
			}
		}
	}
})()