import authState from '$lib/components/auth/local_state.svelte.js';
import { atom } from '$lib/reactivity/atom.svelte';

const ROUTE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const prerender = false;
export const ssr = false;

function shouldRefreshAuthRoutes() {
	if (!authState.value) {
		return false;
	}

	if (!authState.value.routes?.projects) {
		return true;
	}

	return Date.now() - authState.lastRefresh.getTime() > ROUTE_REFRESH_INTERVAL_MS;
}

export async function load({ fetch }) {
	const live_socket = authState.createSocket();

	if (shouldRefreshAuthRoutes()) {
		authState.refresh(fetch).catch(console.error);
	}

	const connectionState = atom(undefined);

	if (live_socket) {
		live_socket.onError((e) => {
			console.error(e);
			connectionState.value = false;
		});

		live_socket.onOpen(() => {
			connectionState.value = true;
		});

		live_socket.onClose(() => {
			connectionState.value = false;
		});

		authState.reconnectSocket();
	}

	return {
		authState,
		live_socket,
		connectionState
	};
}
