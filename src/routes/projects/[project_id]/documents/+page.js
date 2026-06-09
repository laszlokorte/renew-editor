import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import documentApi from '$lib/api/documents.js';
import LiveState from '$lib/api/livestate';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, formatErrorMessage } from '$lib/errors';

export const ssr = false;

function createCommands(api, project, fetchFn) {
	return {
		createDocument: (redirect = false) => {
			return api.createDocument(project).then((d) => {
				if (redirect) {
					goto(`${resolve(`/documents/${d.id}/editor`)}`);
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
					alert(formatErrorMessage(e, 'Document export failed'));
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
				const description = describeError(e, 'Documents could not be loaded');
				return error(description.status || 503, errorPageBody(e, 'Documents could not be loaded'));
			});
	} else {
		return redirect(307, `${resolve('/auth')}`);
	}
}
