import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects.js';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, publishError } from '$lib/errors';
import { offlineResource, readOfflineCache, writeOfflineCache } from '$lib/api/offline_cache.js';

export const ssr = false;
const PROJECTS_CACHE_KEY = 'projects';
const INVITATIONS_CACHE_KEY = 'project-invitations';

function createCommands(api, fetchFn) {
	return {
		createProject(name, redirect) {
			return api.createProject(name).then((r) => {
				if (redirect) {
					return goto(resolve(`/projects/${r.id}`));
				} else {
					return r;
				}
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
					publishError(e, 'Project export failed');
				});
		},

		callJSON(link) {
			return api.callJson(link);
		}
	};
}

export async function load({ fetch }) {
	if (authState.isAuthenticated) {
		const api = projectApi(fetch, authState.routes, authState.authHeader);
		const invitations = api
			.listInvitations()
			.then((j) => {
				writeOfflineCache(INVITATIONS_CACHE_KEY, j);
				return j;
			})
			.catch((e) => {
				const cached = readOfflineCache(INVITATIONS_CACHE_KEY);

				if (cached) {
					return offlineResource(cached, INVITATIONS_CACHE_KEY);
				}

				throw e;
			});

		return api
			.listProjects()
			.then((j) => {
				writeOfflineCache(PROJECTS_CACHE_KEY, j);

				return {
					projects: j,
					invitations,
					commands: createCommands(api, fetch),
					offline: false
				};
			})
			.catch((e) => {
				const cached = readOfflineCache(PROJECTS_CACHE_KEY);

				if (cached) {
					return {
						projects: offlineResource(cached, PROJECTS_CACHE_KEY),
						invitations,
						commands: createCommands(api, fetch),
						offline: true
					};
				}

				const description = describeError(e, 'Projects could not be loaded');
				return error(description.status || 503, errorPageBody(e, 'Projects could not be loaded'));
			});
	} else {
		return redirect(307, resolve('/auth'));
	}
}
