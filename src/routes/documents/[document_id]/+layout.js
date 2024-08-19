import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'

export const ssr = false;

export async function load({params, fetch}) {
	if(authState.isAuthenticated) {
		return fetch(authState.value.routes.document.href.replace(':id', params.document_id), {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).catch((e) => {
			throw error(404, {
				message: 'Not found'
			});
		}).then(r => {
			if (r.ok) {
				return r.json()
			} else {
				return r.json().catch(e => {
					throw {status: r.status, message: "Unknown Errror", details: e};
				}).then((e)  => {
					throw {status: r.status, message: e.message, details: e};
				})
			}
		}).catch((e) => {
			console.log(e)
			return error(e.status, {
				message: e.message
			});
		})
	} else {
		return redirect(307, '/auth')
	}
}