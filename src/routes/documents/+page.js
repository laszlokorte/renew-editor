import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'

export const ssr = false;

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		return fetch(authState.value.routes.documents.href, {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).then(r => r.json()).catch((e) => {
			return error(503, {
				message: 'Service Unavailable'
			});
		})
	} else {
		return redirect(307, '/auth')
	}
}