import authState from '$lib/components/auth/local_state.svelte.js';
import simulationApi from '$lib/api/simulations.js';
import documentApi from '$lib/api/documents.js';
import { downloadFile } from '$lib/io/download';
import { cachedResource } from '$lib/api/resource_cache.js';
import { offlineResource, readOfflineCache, writeOfflineCache } from '$lib/api/offline_cache.js';

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
			return Promise.resolve(sim.links.shadow_net_compiled.href)
				.then((url) => api.loadUrl(url))
				.then((r) => r.blob().then((d) => downloadFile(d, `${sim.id}.sns`)));
		},
		duplicate() {
			return api.callJson(sim.links.duplicate);
		},
		createEditableSimulationDrawing(documentData) {
			return documents
				.loadJson(sim.links.project.href)
				.then((project) => documents.createDocument(project, documentData));
		},
		importDocuments(files) {
			return documents.loadJson(sim.links.project.href).then((project) =>
				documents.importDocuments(project, files).then((response) => {
					if (!response.ok) {
						throw response;
					}

					return response;
				})
			);
		}
	};
}

function linkedSimulationData(api, simulation, simulationId) {
	return {
		symbols: cachedJson(
			api,
			simulationLinkedCacheKey(simulationId, 'symbols'),
			simulation.links.symbols.href,
			(symbols) => new Map(symbols.shapes.map((s) => [s.id, { name: s.name, paths: s.paths }]))
		),
		socket_schemas: cachedJson(
			api,
			simulationLinkedCacheKey(simulationId, 'socket-schemas'),
			simulation.links.socket_schemas.href,
			(socket_schemas) =>
				new Map(
					socket_schemas.socket_schemas.map((s) => [
						s.id,
						{ name: s.name, stencil: s.stencil, sockets: s.sockets }
					])
				)
		),
		shadow_net_system: cachedJson(
			api,
			simulationLinkedCacheKey(simulationId, 'shadow-net-system'),
			simulation.content.shadow_net_system.href,
			(sns) => sns.content
		),
		formalisms: cachedResource('simulation:formalisms', () => api.listFormalisms()).catch(() => []),
		log_entries: Promise.resolve(simulation.links.log?.href).then((href) =>
			cachedJson(
				api,
				simulationLinkedCacheKey(simulationId, 'log'),
				href,
				(log) => log,
				{ content: { items: [] } }
			)
		)
	};
}

export function loadSimulationWorkbenchData(fetchFn, simulationId) {
	const api = simulationApi(fetchFn, authState.routes, authState.authHeader);
	const cacheKey = simulationCacheKey(simulationId);

	return fetchFn(authState.value.routes.simulation.href.replace(':id', simulationId), {
		headers: {
			'Content-Type': 'application/json',
			Authorization: authState.authHeader
		},
		contentType: 'application/json'
	})
		.catch((error) => {
			const cached = readOfflineCache(cacheKey);

			if (cached) {
				return {
					ok: true,
					offline: true,
					json: () => Promise.resolve(cached)
				};
			}

			throw error;
		})
		.then((response) => {
			if (!response.ok) {
				const cached = response.status >= 500 ? readOfflineCache(cacheKey) : undefined;

				if (cached) {
					const cachedSimulationId = cached.id ?? simulationId;
					const simulation = offlineResource(cached, cacheKey);
					return {
						simulation,
						commands: createCommands(fetchFn, cached),
						offline: true,
						...linkedSimulationData(api, cached, cachedSimulationId)
					};
				}

				throw response;
			}

			return response.json().then((json) => {
				if (!response.offline) {
					writeOfflineCache(cacheKey, json);
				}

				const currentSimulationId = json.id ?? simulationId;
				const simulation = response.offline ? offlineResource(json, cacheKey) : json;

				return {
					simulation,
					commands: createCommands(fetchFn, json),
					offline: Boolean(response.offline),
					...linkedSimulationData(api, json, currentSimulationId)
				};
			});
		});
}
