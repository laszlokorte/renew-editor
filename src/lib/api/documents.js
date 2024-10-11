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
			return fetchFn(routes.documents.href, {
				headers: {
					"Content-Type": "application/json",
					"Authorization" : token,
				},
				contentType: "application/json",
				method: "post",
			})
		},

		loadUrl(url) {
			return fetchFn(url, {
				headers: {
					"Content-Type": "application/json",
					"Authorization" : token,
				},
				method: "get",
			})
		},

		importDocuments(files) {
			let formData = new FormData()

			for(let f of files) {
  				formData.append('files[]', f)
			}

  			console.log(formData)

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