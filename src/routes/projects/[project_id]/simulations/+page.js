import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import simulationApi from '$lib/api/simulations.js';
import documentApi from '$lib/api/documents.js';
import { cachedResource } from '$lib/api/resource_cache.js';
import { downloadFile } from '$lib/io/download';

export const ssr = false;

function createCommands(project, api, fetchFn) {
	return {
		createSimulation(doc_ids, main_net_name, formalism) {
			return api.createSimulation(project, doc_ids, main_net_name, formalism).then((r) => {
				return goto(resolve(`/simulations/${r.id}/observer`));
			});
		},

		downloadFile(url, filename) {
			return api
				.loadUrl(url)
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, filename);
					});
				})
				.catch((e) => {
					alert(e.message);
				});
		},

		callJSON(link) {
			return api.callJson(link);
		}
	};
}

export async function load({ fetch, params, parent }) {
	const { project } = await parent();
	if (authState.isAuthenticated) {
		const api = simulationApi(fetch, authState.routes, authState.authHeader);
		const docApi = documentApi(fetch, authState.routes, authState.authHeader);

		return api
			.listSimulations(project.links.simulations.href)
			.then((j) => ({
				simulations: j,
				documents: docApi.listDocuments(project.links.documents.href),
				commands: createCommands(project, api, fetch),
				formalisms: cachedResource('formalisms:list', () => api.listFormalisms())
			}))
			.catch((e) => {
				if (e.error == 'http') {
					return error(e.status, {
						message: e.original.errors.detail
					});
				} else {
					return error(503, {
						message: 'Service Unavailable'
					});
				}
			});
	} else {
		return redirect(307, resolve(`/auth`));
	}
}
