import {fetchJson} from './json'

export default function(fetchFn, routes, token) {
	return {
		deleteDocument(id) {
			return fetchJson(fetchFn, routes.document.href.replace(':id', id), 'delete', {"Authorization" : token})
		},

		createDocument() {
			return fetchJson(fetchFn, routes.documents.href, 'post', {"Authorization" : token})
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

		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', {"Authorization" : token})
		},

		importDocuments(files) {
			let formData = new FormData()

			for(let f of files) {
  				formData.append('files[]', f)
			}

			return fetchFn(routes.import_documents.href, {
				headers: {
					"Authorization" : token,
				},
				method: "post",
				body: formData,
			})
		},
	}
}