export const authenticate = (url, email, password) => {
	return fetch(url, {
		method: "POST",
		mode: "cors",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			email,
			password,
		})
	}).catch(e => {
		throw {error: "network", details: {message: e.message}}
	}).then((r) => {
		if (r.ok) {
			return r.json().then((json)=> {
				return json.token
			}).catch(e => {
				throw {error: "auth", status: r.status, details: {message: "Invalid JSON", data: e}}
			})
		} else {
			return r.json().catch(e => {
				throw {error: "auth", status: r.status, details: {message: "Unexpected Server Response", data: e}}
			}).then((json) => {
				throw {error: "auth", status: r.status, details: json.error}
			})
		}
	})
}