import authState from '$lib/components/auth/local_state.svelte.js'
import { atom } from '$lib/reactivity/atom.svelte';


export const prerender = false;
export const ssr = false;

export async function load({fetch}) {
	const live_socket = authState.createSocket();
	authState.refresh(fetch)


	const connectionState = atom(undefined)

	if(live_socket) {
	    live_socket.onError((e) => {
	      console.error(e);
		  connectionState.value = false
	    });

	    live_socket.onOpen(() => {
		  connectionState.value = true
		});

		live_socket.onClose(() => {
		  connectionState.value = false
		});

	    live_socket.connect();
	}

	return {
		authState,
		live_socket,
		connectionState,
	}
}