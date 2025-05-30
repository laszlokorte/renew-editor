import {fetchJson} from './json'

export default function(fetchFn, routes, token) {
	return {
		listDocuments() {
			return fetchJson(fetchFn, routes.documents.href, 'get', {"Authorization" : token})
		},

		deleteDocument(id) {
			return fetchJson(fetchFn, routes.document.href.replace(':id', id), 'delete', {"Authorization" : token})
		},

		simulateDocument(id, formalism) {
			return fetchJson(fetchFn, routes.create_simulation.href, routes.create_simulation.method, {"Authorization" : token}, {document_ids: [id], formalism})
		},

		callJson({href, method}) {
			return fetchJson(fetchFn, href, method, {"Authorization" : token})
		},

		createDocument() {
			return fetchJson(fetchFn, routes.documents.href, 'post', {"Authorization" : token})
		},

		loadSyntaxes() {
			if(routes.syntax) {
				return fetchJson(fetchFn, routes.syntax.href, 'get', {"Authorization" : token})
			} else {
				return Promise.reject(new Error("routes.syntax.href not defined"))
			}
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

		uploadSvg(_doc_id, svgDocument) {
			const formData = new FormData();

			formData.append('svg[width]', svgDocument.documentElement.width.baseVal.value)
			formData.append('svg[height]', svgDocument.documentElement.height.baseVal.value)
			formData.append('svg[xml]', new XMLSerializer().serializeToString(svgDocument.documentElement))

			return fetch(routes.upload_svg.href, {
				method: "post",
				headers: {"Authorization" : token},
				body: formData
			}).then(r => {
				if(r.ok) {
					return r.json()
				} else {
					throw r
				}
			})
		}
	}
}