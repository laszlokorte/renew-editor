import { fetchJson } from './json';
import { extractServerMessage } from '$lib/errors';

export default function (fetchFn, routes, token) {
	return {
		listProjects(project_id) {
			return new Promise((r) => r(routes.projects.href.replace(':id', project_id))).then((href) =>
				fetchJson(fetchFn, href, 'get', { Authorization: token })
			);
		},
		listInvitations() {
			return new Promise((r) => r(routes.invitations.href)).then((href) =>
				fetchJson(fetchFn, href, 'get', { Authorization: token })
			);
		},

		deleteProject(id) {
			return new Promise((r) => r(routes.project.href)).then((href) =>
				fetchJson(fetchFn, href.replace(':id', id), 'delete', { Authorization: token })
			);
		},

		callJson({ href, method }) {
			return fetchJson(fetchFn, href, method, { Authorization: token });
		},

		createProject() {
			return new Promise((r) => r(routes.projects.href)).then((href) =>
				fetchJson(fetchFn, href, 'post', { Authorization: token })
			);
		},

		loadUrl(url) {
			return fetchFn(url, {
				headers: {
					'Content-Type': 'application/json',
					Authorization: token
				},
				method: 'get'
			}).then((r) => {
				if (r.ok) {
					return r;
				} else {
					return r
						.json()
						.catch((e) => {
							throw {
								error: 'json',
								status: r.status,
								message: 'Unexpected Server Response',
								original: e
							};
						})
						.then((json) => {
							throw { error: 'http', status: r.status, message: extractServerMessage(json), original: json };
						});
				}
			});
		},

		loadJson(url) {
			return fetchJson(fetchFn, url, 'get', { Authorization: token });
		}
	};
}
