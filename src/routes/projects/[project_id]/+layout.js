export const ssr = false;

import { resolve } from '$app/paths';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects';
import { errorPageBody } from '$lib/errors';
import { readOfflineCache, writeOfflineCache } from '$lib/api/offline_cache.js';

function projectCacheKey(projectId) {
	return `project:${projectId}`;
}

export async function load({ fetch, params }) {
	// 	const api = projectApi(fetch, authState.routes, authState.authHeader);

	if (authState.isAuthenticated) {
		const cacheKey = projectCacheKey(params.project_id);

		return fetch(authState.value.routes.project.href.replace(':id', params.project_id), {
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
						'Project could not be loaded'
					)
				);
			})
			.then((r) => {
				if (r.ok) {
					return r.json().then((j) => {
						if (!r.offline) {
							writeOfflineCache(cacheKey, j);
						}

						return {
							project: j,
							offline: Boolean(r.offline)
						};
					});
				} else {
					const cached = r.status >= 500 ? readOfflineCache(cacheKey) : undefined;

					if (cached) {
						return {
							project: cached,
							offline: true
						};
					}

					throw error(
						r.status || 404,
						errorPageBody({ error: 'http', status: r.status || 404 }, 'Project not found')
					);
				}
			});
	} else {
		return redirect(307, `${resolve(`/auth`)}`);
	}
}
