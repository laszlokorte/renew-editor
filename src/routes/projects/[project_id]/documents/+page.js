import { base } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import documentApi from '$lib/api/documents.js';
import LiveState from '$lib/api/livestate';
import { downloadFile } from '$lib/io/download';

export const ssr = false;

function createCommands(api, project, fetchFn) {
	return {
		createDocument: (redirect = false) => {
			return api.createDocument(project).then((d) => {
				if (redirect) {
					goto(`${base}/documents/${d.id}/editor`);
				} else {
					return d;
				}
			});
		},

		downloadFile: (url, filename) => {
			return api
				.loadUrl(url)
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, filename);
					});
				})
				.catch((e) => {
					alert(e.message);
				});
		},

		importDocuments: (files) => {
			return api.importDocuments(project, files);
		}
	};
}

export async function load({ params, fetch, parent }) {
	const { project } = await parent();
	if (authState.isAuthenticated) {
		const api = documentApi(fetch, authState.routes, authState.authHeader);

		return api
			.listDocuments(project.links.documents.href)
			.then((j) => ({
				documents: j,
				commands: createCommands(api, project, fetch)
			}))
			.catch((e) => {
				if (e.error == 'http') {
					return error(e.status, {
						message: e.original.errors.detail
					});
				} else {
					return error(503, {
						message: 'Service Unavailable'
					});
				}
			});
	} else {
		return redirect(307, `${base}/auth`);
	}
}
