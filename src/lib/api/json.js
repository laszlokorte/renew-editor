export function fetchJson(fetchFn, url, method = "GET", headers = {}, body = undefined) {
	return fetchFn(url, {
		method: method,
		mode: "cors",
		headers: {
			...headers,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	}).catch(e => {
		throw {error: "network", status: null, message: e.message, original: e}
	}).then((r) => {
		if (r.ok) {
			return r.json().catch(e => {
				throw {error: "json", status: r.status, message: "Invalid JSON", original: e}
			})
		} else {
			return r.json().catch(e => {
				throw {error: "json", status: r.status, message: "Unexpected Server Response", original: e}
			}).then((json) => {
				throw {error: "http", status: r.status, message: json.message, original: json}
			})
		}
	})
}