export default function(fetchFn, routes, token) {
	return {
		deleteDocument(id) {
			return fetchFn(routes.document.href.replace(':id', id), {
				headers: {
					"Content-Type": "application/json",
					"Authorization" : token,
				},
				contentType: "application/json",
				method: "delete",
			})
		},

		createDocument() {
			return fetch(routes.documents.href, {
				headers: {
					"Content-Type": "application/json",
					"Authorization" : token,
				},
				contentType: "application/json",
				method: "post",
			})
		},
	}
}