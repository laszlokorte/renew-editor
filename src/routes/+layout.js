import authState from '$lib/components/auth/local_state.svelte.js'


export const prerender = false;
export const ssr = false;

export async function load() {
	const live_socket = authState.createSocket()
	if(live_socket) {
	    live_socket.onError((e) => console.error(e));
	    live_socket.connect();
	}

	return {
		authState,
		live_socket,
	}
}