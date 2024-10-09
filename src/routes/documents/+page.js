import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import documentApi from '$lib/api/documents.js'
import LiveState from '$lib/api/livestate';

export const ssr = false;

function createDocumentAction(fetchFn) {
	return function() {
		return documentApi(fetchFn, authState.routes, authState.authHeader)
			.createDocument()
			.then(r => {
				r.json().then((d) => {
					goto(`${base}/documents/${d.document.id}/editor`)
				})
			})
	}
}

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		return fetch(authState.value.routes.documents.href, {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).then(r => r.json()).then(j => ({
			documents: j,
			createDocument: createDocumentAction(fetch),
		})).catch((e) => {
			return error(503, {
				message: 'Service Unavailable'
			});
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}