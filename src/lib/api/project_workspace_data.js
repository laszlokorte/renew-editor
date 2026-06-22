import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import documentApi from '$lib/api/documents.js';
import simulationApi from '$lib/api/simulations.js';
import { cachedResource } from '$lib/api/resource_cache.js';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, publishError } from '$lib/errors';
import { offlineResource, readOfflineCache, writeOfflineCache } from '$lib/api/offline_cache.js';

function projectDocumentsCacheKey(projectId) {
	return `project-documents:${projectId}`;
}

function emptySimulationsResource(project) {
	return {
		href: project.links.simulations.href,
		topic: `project-simulations:${project.id}`,
		content: { items: [] },
		links: {
			create: {
				href: project.links.simulations.href,
				method: 'POST'
			},
			project: {
				href: project.href,
				id: project.id,
				method: 'GET'
			}
		}
	};
}

function createCommands(api, simulations, project) {
	const projectWorkspaceHref = (suffix = '') => resolve(`/projects/${project.id}/workspace${suffix}`);
	const documentWorkspaceHref = (documentId, suffix = '') =>
		resolve(`/projects/${project.id}/workspace/${documentId}${suffix}`);
	const simulationWorkspaceHref = (simulationId) =>
		resolve(`/projects/${project.id}/workspace/${simulationId}`);

	return {
		createDocument: (redirectToDocument = false) => {
			return api.createDocument(project).then((d) => {
				if (redirectToDocument) {
					goto(documentWorkspaceHref(d.id));
				} else {
					return d;
				}
			});
		},

		downloadFile: (url, filename) => {
			return api
				.loadUrl(url)
				.then((r) => r.blob().then((d) => downloadFile(d, filename)))
				.catch((e) => {
					publishError(e, 'Document export failed');
				});
		},

		importDocuments: (files) => {
			return api.importDocuments(project, files);
		},

		createSimulation(document_ids, main_net_name, formalism) {
			return simulations
				.createSimulation(project, document_ids, main_net_name, formalism)
				.then((r) => {
					return goto(simulationWorkspaceHref(r.id));
				});
		},

		callJSON(link) {
			return simulations.callJson(link);
		}
	};
}

export async function loadProjectWorkspaceData({ fetch, parent }) {
	const { project, offline: projectOffline } = await parent();
	if (!authState.isAuthenticated) {
		return redirect(307, `${resolve('/auth')}`);
	}

	const api = documentApi(fetch, authState.routes, authState.authHeader);
	const simulations = simulationApi(fetch, authState.routes, authState.authHeader);
	const cacheKey = projectDocumentsCacheKey(project.id);
	const simulationList = await simulations
		.listSimulations(project.links.simulations.href)
		.catch(() => emptySimulationsResource(project));

	return api
		.listDocuments(project.links.documents.href)
		.then((j) => {
			writeOfflineCache(cacheKey, j);

			return {
				documents: j,
				simulations: simulationList,
				formalisms: cachedResource('formalisms:list', () => simulations.listFormalisms()),
				commands: createCommands(api, simulations, project),
				offline: Boolean(projectOffline)
			};
		})
		.catch((e) => {
			const cached = readOfflineCache(cacheKey);

			if (cached) {
				return {
					documents: offlineResource(cached, cacheKey),
					simulations: simulationList,
					formalisms: cachedResource('formalisms:list', () => simulations.listFormalisms()),
					commands: createCommands(api, simulations, project),
					offline: true
				};
			}

			const description = describeError(e, 'Documents could not be loaded');
			return error(description.status || 503, errorPageBody(e, 'Documents could not be loaded'));
		});
}
