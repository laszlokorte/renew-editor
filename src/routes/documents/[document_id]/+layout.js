import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'

export const ssr = false;

function deleteAction(fetch, id) {
	return function() {
		fetch(authState.value.routes.document.href.replace(':id', id), {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
			method: "delete",
		}).then((r) => {
			if(r.ok) {
				goto('/documents')
			}
		})
	}
}

export async function load({params, fetch}) {
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
						document: j.document,
						deleteAction: deleteAction(fetch, j.document.id)
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
				message: e.body.message
			});
		})
	} else {
		return redirect(307, '/auth')
	}
}