import {fetchJson} from './json'

export default function(fetchFn, routes, token) {
	return {
		listSimulations() {
			return fetchJson(fetchFn, routes.simulations.href, 'get', {"Authorization" : token})
		},
		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', {"Authorization" : token})
		},


		createSimulation(document_ids, main_net_name) {
			return fetchJson(fetchFn, routes.create_simulation.href, routes.create_simulation.method, {"Authorization" : token}, {document_ids, main_net_name})
		},



	}
}