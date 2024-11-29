import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import simulationApi from '$lib/api/simulations.js'
import LiveState from '$lib/api/livestate';

export const ssr = false;

function createCommands(api, fetchFn) {
	return {
	}
}

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		const api = simulationApi(fetch, authState.routes, authState.authHeader)

		return api.listSimulations().then(j => ({
			simulations: j,
			commands: createCommands(api, fetch),
		})).catch((e) => {
			return error(503, {
				message: 'Service Unavailable'
			});
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}