import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import documentApi from '$lib/api/documents.js'
import {downloadFile} from '$lib/io/download';

export const ssr = false;

function createCommands(fetchFn, doc) {
	const api = documentApi(fetchFn, authState.routes, authState.authHeader)

	return {
		deleteDocument() {
			return api
				.deleteDocument(doc.id)
				.then((r) => {
					return goto(`${base}/documents`)
				})
		},

		duplicateDocument() {
			return api
				.callJson(doc.links.duplicate)
				.then((r) => {
					return goto(`${base}/documents/${r.id}/editor`)
				})
		},

		simulateDocument() {
			return api
				.simulateDocument(doc.id)
				.then((r) => {
					window.open(`${base}/simulations/${r.id}/observer`)
					
					return r 
				})
		},

		downloadJson(svg) {
			return new Promise(r => r(doc.links.download_json.href))
			.then((url) => api.loadUrl(url))
			.then(r => {
				return r.blob().then((d) => {
					downloadFile(d, `${doc.content.name}.json`)
				})
			}).catch(e => {
				alert(e.message)
			})
		},
		downloadStruct(svg) {
			return new Promise(r => r(doc.links.download_struct.href))
			.then((url) => api.loadUrl(url))
			.then(r => {
				return r.blob().then((d) => {
					downloadFile(d, `${doc.content.name}.iex`)
				})
			}).catch(e => {
				alert(e.message)
			})
		},
		exportRenew(svg) {
			return new Promise(r => r(doc.links.export.href))
			.then((url) => api.loadUrl(url))
			.then(r => {
				return r.blob().then((d) => {
					downloadFile(d, `${doc.content.name}.rnw`)
				})
			}).catch(e => {
				alert(e.message)
			})
		},
		uploadSvg(svg) {
			return api.uploadSvg(doc.id, svg)
		}
	}
}

export async function load({params, fetch}) {
	const api = documentApi(fetch, authState.routes, authState.authHeader)

	if(authState.isAuthenticated) {
		return fetch(authState.value.routes.document.href.replace(':id', params.document_id), {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).catch((e) => {
			throw error(503, {
				message: e.message
			});
		}).then(r => {
			if (r.ok) {
				return r.json().then(j => {
					return {
						document: j,
						commands: createCommands(fetch, j),
						symbols: new Promise((r, e) => j.links.symbols ? r(j.links.symbols.href) : e("doc.links.symbols not defined")).then(api.loadJson).then(symbols => {
							return new Map(symbols.shapes.map(s => [s.id, {name:s.name, paths: s.paths}]))
						}),
						socket_schemas: new Promise((r, e) => j.links.socket_schemas ? r(j.links.socket_schemas.href) : e("doc.links.socket_schemas not defined")).then(api.loadJson).then(socket_schemas => {
							return new Map(socket_schemas.socket_schemas.map(s => [s.id, {name:s.name, sockets: s.sockets}]))
						}),
						semantic_tags: new Promise((r, e) => j.links.semantic_tags ? r(j.links.semantic_tags.href) : e("doc.links.semantic_tags not defined")).then(api.loadJson).then(semantic_tags => {
							return semantic_tags.semantic_tags
						}),
						primitives: new Promise((r, e) => j.links.primitives ? r(j.links.primitives.href) : e("doc.links.primitives not defined")).then(api.loadJson).then(primitives => {
							return primitives.groups
						}),
						blueprints: new Promise((r, e) => j.links.blueprints ? r(j.links.blueprints.href) : e("doc.links.blueprints not defined")).then(api.loadJson).then(blueprints => {
							return new Map(blueprints.blueprints.map(s => [s.id, {name:s.name, sockets: s.sockets}]))
						}),
					}
				})
			} else {
				return r.json().catch(e => {
					throw error(r.status || 420, {message: "Unknown Error", details: e});
				}).then((e)  => {
					throw error(r.status || 420, {message: e.message, details: e});
				})
			}
		}).catch((e) => {
			return error(e.status || 420, {
				message: e?.body?.message ?? e.message
			});
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}