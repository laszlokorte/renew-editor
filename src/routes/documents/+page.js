import { redirect } from '@sveltejs/kit';
import authState from '../auth/auth_state.svelte.js'

export const ssr = false;

export async function load(x) {
	return new Promise(
		(resolver) => {
			if(authState.isAuthenticated){
				resolver({documents: [1,2,3]})
			} else {
				resolver(redirect(307, '/auth'))
			}
		}
	)
}