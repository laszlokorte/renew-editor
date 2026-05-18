export const ssr = false;

import { resolve } from '$app/paths';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import projectApi from '$lib/api/projects';

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
				} else {
					throw error(404, 'Not Found');
				}
			});
	} else {
		return redirect(307, `${resolve(`/auth`)}`);
	}
}
