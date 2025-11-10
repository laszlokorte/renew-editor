import { fetchJson } from './json';

export default function (fetchFn, routes, token) {
	return {
		listDocuments(url) {
			return fetchJson(fetchFn, url, 'get', {
				Authorization: token
			});
		},

		deleteDocument(id) {
			return fetchJson(fetchFn, routes.document.href.replace(':id', id), 'delete', {
				Authorization: token
			});
		},

		simulateDocument(document, formalism) {
			return fetchJson(
				fetchFn,
				document.links.create_simulation.href,
				document.links.create_simulation.method,
				{ Authorization: token },
				{ document_ids: [document.id], formalism }
			);
		},

		callJson({ href, method }) {
			return fetchJson(fetchFn, href, method, { Authorization: token });
		},

		createDocument(project) {
			return fetchJson(fetchFn, project.links.documents.href, 'post', { Authorization: token });
		},

		loadSyntaxes() {
			if (routes.syntax) {
				return fetchJson(fetchFn, routes.syntax.href, 'get', { Authorization: token });
			} else {
				return Promise.reject(new Error('routes.syntax.href not defined'));
			}
		},

		loadUrl(url) {
			return fetchFn(url, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: token
				},
				method: 'get'
			}).then((r) => {
				if (r.ok) {
					return r;
				} else {
					return r
						.json()
						.catch((e) => {
							throw {
								error: 'json',
								status: r.status,
								message: 'Unexpected Server Response',
								original: e
							};
						})
						.then((json) => {
							throw { error: 'http', status: r.status, message: json.message, original: json };
						});
				}
			});
		},

		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', { Authorization: token });
		},

		importDocuments(project, files) {
			let formData = new FormData();

			for (let f of files) {
				formData.append('files[]', f);
			}

			return fetchFn(project.links.import_documents.href, {
				headers: {
					Authorization: token
				},
				method: 'post',
				body: formData
			});
		},

		uploadSvg(document, svgDocument) {
			return new Promise((resolve) => {
				const formData = new FormData();

				formData.append('svg[width]', svgDocument.documentElement.width.baseVal.value);
				formData.append('svg[height]', svgDocument.documentElement.height.baseVal.value);
				formData.append(
					'svg[xml]',
					new XMLSerializer().serializeToString(svgDocument.documentElement)
				);

				return resolve(formData);
			}).then((formData) => {
				return fetch(document.links.upload_svg.href, {
					method: document.links.upload_svg.method,
					headers: { Authorization: token },
					body: formData
				}).then((r) => {
					if (r.ok) {
						return r.json();
					} else {
						throw r;
					}
				});
			});
		}
	};
}
