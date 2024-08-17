import { fetchJson } from './json'

export const authenticate = (url, email, password) => {
	return fetchJson(url, "POST", {
		email,
		password,
	}).then((json)=> {
		return {
			token: json.token,
			url: url,
			email: email,
		}
	}).catch(error => {
		if(error.error == 'http') {
			throw {error: "auth", message: error.message, original: error}
		} else {
			throw error
		}
	})
}