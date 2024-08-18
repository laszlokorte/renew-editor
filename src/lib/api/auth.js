import { fetchJson } from './json'

export const authenticate = (url, email, password) => {
	return fetchJson(url, "GET").then((protocolJson)=> {
		return fetchJson(protocolJson.routes.auth.href, protocolJson.routes.auth.method, {
			email,
			password,
		}).then((authJson)=> {
			return {
				token: authJson.token,
				url: url,
				email: email,
				routes: protocolJson.routes,
			}
		}).catch(error => {
			if(error.error == 'http') {
				throw {error: "auth", message: error.message, original: error}
			} else {
				throw error
			}
		})
	}).catch(error => {
		if(error.error == 'http') {
			throw {error: "auth", message: error.message, original: error}
		} else {
			throw error
		}
	})
}