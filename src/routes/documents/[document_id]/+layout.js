import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import documentApi from '$lib/api/documents.js'

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
						symbols: api.loadJson(j.links.symbols.href).then(symbols => {
							return new Map(symbols.shapes.map(s => [s.id, {name:s.name, paths: s.paths}]))
						}),
						socket_schemas: api.loadJson(j.links.socket_schemas.href).then(socket_schemas => {
							return new Map(socket_schemas.socket_schemas.map(s => [s.id, {name:s.name, sockets: s.sockets}]))
						}),
						semantic_tags: api.loadJson(j.links.semantic_tags.href).then(semantic_tags => {
							return semantic_tags.semantic_tags
						}),
					}
				})
			} else {
				return r.json().catch(e => {
					throw error(r.status, {message: "Unknown Errror", details: e});
				}).then((e)  => {
					throw error(r.status, {message: e.message, details: e});
				})
			}
		}).catch((e) => {
			return error(e.status, {
				message: e?.body?.message ?? e.message
			});
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}