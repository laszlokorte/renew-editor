export const ssr = false;

import { resolve } from '$app/paths';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects';
import { errorPageBody } from '$lib/errors';

export async function load({ fetch, params }) {
	// 	const api = projectApi(fetch, authState.routes, authState.authHeader);

	if (authState.isAuthenticated) {
		return fetch(authState.value.routes.project.href.replace(':id', params.project_id), {
			headers: {
				'Content-Type': 'application/json',
				Authorization: authState.authHeader
			},
			contentType: 'application/json'
		})
			.catch((e) => {
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
						return {
							project: j
						};
					});
				} else {
					throw error(404, errorPageBody({ error: 'http', status: 404 }, 'Project not found'));
				}
			});
	} else {
		return redirect(307, `${resolve(`/auth`)}`);
	}
}
