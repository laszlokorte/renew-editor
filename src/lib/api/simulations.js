import {fetchJson} from './json'

export default function(fetchFn, routes, token) {
	return {
		listSimulations() {
			return fetchJson(fetchFn, routes.simulations.href, 'get', {"Authorization" : token})
		},
		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', {"Authorization" : token})
		},


	}
}