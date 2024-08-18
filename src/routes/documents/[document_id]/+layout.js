import { redirect } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'

export const ssr = false;

export async function load({params, fetch}) {
	if(authState.isAuthenticated) {
		console.log(authState.value.routes.document.href)
		return fetch(authState.value.routes.document.href.replace(':id', params.document_id), {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).then(r => {
			if (r.ok) {
				return r.json()
			} else {
				return r.json().catch(e => {
					throw e;
				}).then((j)  => {
					throw j;
				})
			}
		})
	} else {
		return redirect(307, '/auth')
	}
}