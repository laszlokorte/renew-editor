import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js'
import projectApi from '$lib/api/projects.js'
import {downloadFile} from '$lib/io/download';

export const ssr = false;

function createCommands(api, fetchFn) {
	return {
		createProject(name) {
			return api
				.createProject(name)
				.then((r) => {
					return goto(`${base}/projects/${r.id}`)
				})
		},

		downloadFile(url, filename) {
			return api.loadUrl(url)
			.then(r => {
				return r.blob().then((d) => {
					downloadFile(d, filename)
				})
			}).catch(e => {
				alert(e.message)
			})
		},

		callJSON(link) {
			return api.callJson(link)
		}
	}
}

export async function load({fetch}) {
	if(authState.isAuthenticated) {
		const api = projectApi(fetch, authState.routes, authState.authHeader)

		return api.listProjects().then(j => ({
			projects: j,
			commands: createCommands(api, fetch)
		})).catch((e) => {
			if(e.error == "http") {
				return error(e.status, {
					message: e.original.errors.detail
				});
			} else {
				return error(503, {
					message: 'Service Unavailable'
				});
			}
		})
	} else {
		return redirect(307, `${base}/auth`)
	}
}