import authState from '$lib/components/auth/local_state.svelte.js'
import { atom } from '$lib/reactivity/atom.svelte';


export const prerender = false;
export const ssr = false;

export async function load() {
	const live_socket = authState.createSocket();

	const connectionState = atom(undefined)

	if(live_socket) {
	    live_socket.onError((e) => console.error(e));
	    live_socket.connect();

	    live_socket.onOpen(() => {
		  connectionState.value = true
		});

		live_socket.onClose(() => {
		  connectionState.value = false
		});
	}

	return {
		authState,
		live_socket,
		connectionState,
	}
}