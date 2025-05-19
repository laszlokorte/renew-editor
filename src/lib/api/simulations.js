import {fetchJson} from './json'

export default function(fetchFn, routes, token) {
	return {
		listSimulations() {
			return fetchJson(fetchFn, routes.simulations.href, 'get', {"Authorization" : token})
		},
		listFormalisms() {
			return fetchJson(fetchFn, routes.formalisms.href, 'get', {"Authorization" : token}).then(r => (console.log(r.formalisms), r.formalisms))
		},
		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', {"Authorization" : token})
		},

		callJson({href, method}) {
			return fetchJson(fetchFn, href, method, {"Authorization" : token})
		},

		createSimulation(document_ids, main_net_name, formalism) {
			return fetchJson(fetchFn, routes.create_simulation.href, routes.create_simulation.method, {"Authorization" : token}, {document_ids, main_net_name, formalism})
		},

		loadUrl(url) {
			return fetchFn(url, {
				headers: {
					"Content-Type": "application/json",
					"Authorization" : token,
				},
				method: "get",
			}).then((r) => {
				if (r.ok) {
					return r
				} else {
					return r.json().catch(e => {
						throw {error: "json", status: r.status, message: "Unexpected Server Response", original: e}
					}).then((json) => {
						throw {error: "http", status: r.status, message: json.message, original: json}
					})
				}
			})
		},

	}
}