import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import simulationApi from '$lib/api/simulations.js'
import documentApi from '$lib/api/documents.js'
import LiveState from '$lib/api/livestate';
import {downloadFile} from '$lib/io/download';

export const ssr = false;

function createCommands(api, fetchFn) {
	return {
		createSimulation(doc_ids, main_net_name, formalism) {
			return api
				.createSimulation(doc_ids, main_net_name, formalism)
				.then((r) => {
					return goto(`${base}/simulations/${r.id}/observer`)
				})
		},

		downloadFile(url, filename) {
			return api.loadUrl(url)
			.then(r => {
				return r.blob().then((d) => {
					downloadFile(d, filename)
				})
			}).catch(e => {
				alert(e.message)
			})
		},

		callJSON(link) {
			return api.callJson(link)
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
			documents: docApi.listDocuments(),
			formalisms: api.listFormalisms()
		})).catch((e) => {
			if(e.error == "http") {
				return error(e.status, {
					message: e.original.errors.detail
				});
			} else {
				return error(503, {
					message: 'Service Unavailable'
				});
			}
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}