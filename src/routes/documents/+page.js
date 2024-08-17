import { redirect } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'

export const ssr = false;

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		return fetch("http://127.0.0.1:9999/?page=documents", {
			headers: {
				"Content-Type": "application/json",
				"Authorization" : authState.authHeader,
			},
			contentType: "application/json",
		}).then(r => r.json())
	} else {
		return redirect(307, '/auth')
	}
}