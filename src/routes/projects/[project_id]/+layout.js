export const ssr = false;

import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects';
import LiveState from '$lib/api/livestate';
import { downloadFile } from '$lib/io/download';

function createCommands(api, fetchFn) {
	return {};
}

export async function load({ fetch, params }) {
	const api = projectApi(fetch, authState.routes, authState.authHeader);

	if (authState.isAuthenticated) {
		return fetch(authState.value.routes.project.href.replace(':id', params.project_id), {
			headers: {
				'Content-Type': 'application/json',
				Authorization: authState.authHeader
			},
			contentType: 'application/json'
		})
			.catch((e) => {
				throw error(503, {
					message: e.message
				});
			})
			.then((r) => {
				if (r.ok) {
					return r.json().then((j) => {
						return {
							project: j
						};
					});
				}
			});
	} else {
		return redirect(307, `${base}/auth`);
	}
}
