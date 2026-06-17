import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import simulationApi from '$lib/api/simulations.js';
import documentApi from '$lib/api/documents.js';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, publishError } from '$lib/errors';
import { offlineResource, readOfflineCache, writeOfflineCache } from '$lib/api/offline_cache.js';

export const ssr = false;

function simulationCacheKey(simulationId) {
	return `simulation:${simulationId}`;
}

function simulationLinkedCacheKey(simulationId, name) {
	return `simulation:${simulationId}:${name}`;
}

function cachedJson(api, cacheKey, href, transform, fallback = undefined) {
	if (!href) {
		const cached = readOfflineCache(cacheKey);

		if (cached !== undefined) {
			return Promise.resolve(transform(cached));
		}

		if (fallback !== undefined) {
			return Promise.resolve(fallback);
		}

		return Promise.reject(new Error('Resource link is not available'));
	}

	return api
		.loadJson(href)
		.then((json) => {
			writeOfflineCache(cacheKey, json);
			return transform(json);
		})
		.catch((error) => {
			const cached = readOfflineCache(cacheKey);

			if (cached !== undefined) {
				return transform(cached);
			}

			if (fallback !== undefined) {
				return fallback;
			}

			throw error;
		});
}

function createCommands(fetchFn, sim) {
	const api = simulationApi(fetchFn, authState.routes, authState.authHeader);
	const documents = documentApi(fetchFn, authState.routes, authState.authHeader);

	return {
		downloadSNS() {
			return new Promise((r) => r(sim.links.shadow_net_compiled.href))
				.then((url) => api.loadUrl(url))
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, `${sim.id}.sns`);
					});
				})
				.catch((e) => {
					publishError(e, 'Compiled shadow net export failed');
				});
		},
		duplicate() {
			return api.callJson(sim.links.duplicate).then((r) => {
				return goto(resolve(`/simulations/${r.id}/observer`));
			});
		},
		createEditableSimulationDrawing(documentData) {
			return documents.loadJson(sim.links.project.href).then((project) =>
				documents.createDocument(project, documentData).then((r) => {
					return goto(resolve(`/documents/${r.id}/editor`));
				})
			);
		},
		importDocuments(files) {
			return documents.loadJson(sim.links.project.href).then((project) =>
				documents.importDocuments(project, files).then((response) => {
					if (!response.ok) {
						throw response;
					}

					return goto(resolve(`/projects/${sim.links.project.id}/documents`));
				})
			);
		}
	};
}

export async function load({ params, fetch }) {
	const api = simulationApi(fetch, authState.routes, authState.authHeader);

	if (authState.isAuthenticated) {
		const cacheKey = simulationCacheKey(params.simulation_id);

		return fetch(authState.value.routes.simulation.href.replace(':id', params.simulation_id), {
			headers: {
				'Content-Type': 'application/json',
				Authorization: authState.authHeader
			},
			contentType: 'application/json'
		})
			.catch((e) => {
				const cached = readOfflineCache(cacheKey);

				if (cached) {
					return {
						ok: true,
						offline: true,
						json: () => Promise.resolve(cached)
					};
				}

				throw error(
					503,
					errorPageBody(
						{ error: 'network', original: e, message: e.message },
						'Simulation could not be loaded'
					)
				);
			})
			.then((r) => {
				if (r.ok) {
					return r.json().then((j) => {
						if (!r.offline) {
							writeOfflineCache(cacheKey, j);
						}

						const simulation = r.offline ? offlineResource(j, cacheKey) : j;
						const simulationId = j.id ?? params.simulation_id;

						return {
							simulation,
							commands: createCommands(fetch, j),
							offline: Boolean(r.offline),
							symbols: cachedJson(
								api,
								simulationLinkedCacheKey(simulationId, 'symbols'),
								j.links.symbols.href,
								(symbols) => {
									return new Map(
										symbols.shapes.map((s) => [s.id, { name: s.name, paths: s.paths }])
									);
								}
							),
							socket_schemas: cachedJson(
								api,
								simulationLinkedCacheKey(simulationId, 'socket-schemas'),
								j.links.socket_schemas.href,
								(socket_schemas) => {
									return new Map(
										socket_schemas.socket_schemas.map((s) => [
											s.id,
											{ name: s.name, stencil: s.stencil, sockets: s.sockets }
										])
									);
								}
							),
							shadow_net_system: cachedJson(
								api,
								simulationLinkedCacheKey(simulationId, 'shadow-net-system'),
								j.content.shadow_net_system.href,
								(sns) => sns.content
							),
							formalisms: api.listFormalisms().catch(() => []),
							log_entries: new Promise((r, e) =>
								j.links.log ? r(j.links.log.href) : e('links.log not defined')
							).then((h) =>
								cachedJson(api, simulationLinkedCacheKey(simulationId, 'log'), h, (log) => log)
							)
						};
					});
				} else {
					const cached = r.status >= 500 ? readOfflineCache(cacheKey) : undefined;

					if (cached) {
						return {
							simulation: offlineResource(cached, cacheKey),
							commands: createCommands(fetch, cached),
							offline: true,
							symbols: cachedJson(
								api,
								simulationLinkedCacheKey(cached.id ?? params.simulation_id, 'symbols'),
								cached.links.symbols.href,
								(symbols) =>
									new Map(symbols.shapes.map((s) => [s.id, { name: s.name, paths: s.paths }])),
								new Map()
							),
							socket_schemas: cachedJson(
								api,
								simulationLinkedCacheKey(cached.id ?? params.simulation_id, 'socket-schemas'),
								cached.links.socket_schemas.href,
								(socket_schemas) =>
									new Map(
										socket_schemas.socket_schemas.map((s) => [
											s.id,
											{ name: s.name, stencil: s.stencil, sockets: s.sockets }
										])
									),
								new Map()
							),
							shadow_net_system: cachedJson(
								api,
								simulationLinkedCacheKey(cached.id ?? params.simulation_id, 'shadow-net-system'),
								cached.content.shadow_net_system.href,
								(sns) => sns.content,
								{ nets: [] }
							),
							formalisms: [],
							log_entries: cachedJson(
								api,
								simulationLinkedCacheKey(cached.id ?? params.simulation_id, 'log'),
								cached.links.log?.href,
								(log) => log,
								{ content: { items: [] } }
							)
						};
					}

					return r
						.json()
						.catch((e) => {
							throw error(
								r.status,
								errorPageBody(
									{ error: 'json', status: r.status, original: e },
									'Simulation could not be loaded'
								)
							);
						})
						.then((e) => {
							throw error(
								r.status,
								errorPageBody(
									{ error: 'http', status: r.status, original: e },
									'Simulation could not be loaded'
								)
							);
						});
				}
			})
			.catch((e) => {
				const description = describeError(e, e?.body?.message ?? e.message);
				return error(
					description.status || e?.status || 418,
					errorPageBody(e, 'Simulation could not be loaded')
				);
			});
	} else {
		return redirect(307, resolve(`/auth`));
	}
}
