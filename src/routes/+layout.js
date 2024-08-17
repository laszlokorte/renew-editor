import authState from '$lib/components/auth/local_state.svelte.js'

export const prerender = false;

export async function load() {
	return {
		authState
	}
}