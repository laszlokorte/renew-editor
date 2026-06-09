import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects.js';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, formatErrorMessage } from '$lib/errors';

export const ssr = false;

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
					alert(formatErrorMessage(e, 'Project export failed'));
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

		return api
			.listProjects()
			.then((j) => ({
				projects: j,
				invitations: api.listInvitations(),
				commands: createCommands(api, fetch)
			}))
			.catch((e) => {
				const description = describeError(e, 'Projects could not be loaded');
				return error(description.status || 503, errorPageBody(e, 'Projects could not be loaded'));
			});
	} else {
		return redirect(307, resolve('/auth'));
	}
}
