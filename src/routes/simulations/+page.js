import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import simulationApi from '$lib/api/simulations.js'
import documentApi from '$lib/api/documents.js'
import LiveState from '$lib/api/livestate';

export const ssr = false;

function createCommands(api, fetchFn) {
	return {
		createSimulation(doc_ids, main_net_name) {
			return api
				.createSimulation(doc_ids, main_net_name)
				.then((r) => {
					return goto(`${base}/simulations/${r.id}/observer`)
				})
		}
	}
}

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		const api = simulationApi(fetch, authState.routes, authState.authHeader)
		const docApi = documentApi(fetch, authState.routes, authState.authHeader)

		return api.listSimulations().then(j => ({
			simulations: j,
			commands: createCommands(api, fetch),
			documents: docApi.listDocuments()
		})).catch((e) => {
			return error(503, {
				message: 'Service Unavailable'
			});
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}