import { resolve } from '$app/paths';
import { goto } from '$app/navigation';
import { redirect, error } from '@sveltejs/kit';
import authState from '$lib/components/auth/local_state.svelte.js';
import documentApi from '$lib/api/documents.js';
import { cachedResource } from '$lib/api/resource_cache.js';
import { downloadFile } from '$lib/io/download';
import { describeError, errorPageBody, formatErrorMessage } from '$lib/errors';
import defaultSyntax from './defaultSyntax.json';

export const ssr = false;

function loadLinkJson(api, link, label) {
	if (!link?.href) {
		return Promise.reject({ error: 'link', message: `${label} link is missing` });
	}

	return api.loadJson(link.href);
}

function cachedLinkJson(api, link, label) {
	if (!link?.href) {
		return Promise.reject({ error: 'link', message: `${label} link is missing` });
	}

	return cachedResource(`${label}:${link.href}`, () => api.loadJson(link.href));
}

function createCommands(fetchFn, doc) {
	const api = documentApi(fetchFn, authState.routes, authState.authHeader);

	return {
		deleteDocument() {
			return api.deleteDocument(doc.id).then((r) => {
				return goto(resolve(`/projects/${doc.links.project.id}/documents`));
			});
		},

		duplicateDocument() {
			return api.callJson(doc.links.duplicate).then((r) => {
				return goto(resolve(`/documents/${r.id}/editor`));
			});
		},

		simulateDocument(formalism) {
			const simWindow = new Promise((res, reject) => {
				const w = window.open('', '_blank');
				if (w) {
					w.document.write(`
				        <html>
				        <head>
				            <title>Creating Simulation</title>
   									<meta
    										name="viewport"
    										content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
   									/>
   									<link rel="icon" href="${resolve('/favicon.svg')}" />
   									<meta charset="utf-8" />
   									<meta name="HandheldFriendly" content="true" />
   									<meta name="MobileOptimized" content="width" />
   									<meta name="color-scheme" content="light" />
   									<meta name="mobile-web-app-capable" content="yes" />
   									<meta name="apple-mobile-web-app-capable" content="yes" />
   									<meta name="apple-mobile-web-app-status-bar-style" content="black" />
   									<meta name="apple-mobile-web-app-title" content="PetriStation" />
							<style>
								html {
									height: 100%;
								}
								body {
									font-family: monospace;
									display: grid;
									align-content: center;
									justify-content: center;
									height: 100%;
									font-size: 1.2em;
									background: #ddeeee;
								}

								h1 {
									font-size: 1.2em;
									margin: 0;
								}

								.container {
									padding: 1em;
									background: #fff;
									border: 1ex solid #eee;
									gap: 1em;
									display: flex;
									flex-direction: column;
								}

								p {
									margin: 0;
								}
							</style>
				        </head>
				        <body>
				            <div class="container">
							<img style="width: 4em; margin: 1em auto" src="${resolve('/favicon.svg')}" alt="Renew" class="icon" />

							<h1>Setting up Simulation</h1>
							<p>Compiling Shadow Nets…</p>
							<div class="status">may take a few seconds</div>
				            </div>
				        </body>
				        </html>
				    `);
					w.document.close();

					res(w);
				} else {
					reject('could not open new window');
				}
			});

			const sim = api.simulateDocument(doc, formalism);

			return simWindow
				.then((w) => {
					sim
						.then((r) => {
							w.location = resolve(`/simulations/${r.id}/observer`);
						})
						.catch((e) => {
							console.error(e);
							w.document.querySelector('.status').textContent = formatErrorMessage(
								e,
								'Simulation could not be created'
							);
						});
				})
				.catch(() => {
					return sim.then((r) => {
						window.location = resolve(`/simulations/${r.id}/observer`);

						return r;
					});
				});
		},

		downloadJson(svg) {
			return new Promise((r) => r(doc.links.download_json.href))
				.then((url) => api.loadUrl(url))
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, `${doc.content.name}.json`);
					});
				})
				.catch((e) => {
					alert(formatErrorMessage(e, 'JSON export failed'));
				});
		},
		downloadStruct(svg) {
			return new Promise((r) => r(doc.links.download_struct.href))
				.then((url) => api.loadUrl(url))
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, `${doc.content.name}.iex`);
					});
				})
				.catch((e) => {
					alert(formatErrorMessage(e, 'Document structure export failed'));
				});
		},
		exportRenew(svg) {
			return new Promise((r) => r(doc.links.export.href))
				.then((url) => api.loadUrl(url))
				.then((r) => {
					return r.blob().then((d) => {
						downloadFile(d, `${doc.content.name}.rnw`);
					});
				})
				.catch((e) => {
					alert(formatErrorMessage(e, 'Renew export failed'));
				});
		},
		uploadSvg(svg) {
			return api.uploadSvg(doc, svg);
		}
	};
}

export async function load({ params, fetch }) {
	const api = documentApi(fetch, authState.routes, authState.authHeader);

	if (authState.isAuthenticated) {
		const syntaxes = cachedResource('syntax:list', () => api.loadSyntaxes());

		return fetch(authState.value.routes.document.href.replace(':id', params.document_id), {
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
						'Document could not be loaded'
					)
				);
			})
			.then((r) => {
				if (r.ok) {
					return r.json().then((j) => {
						return {
							document: j,
							commands: createCommands(fetch, j),
							symbols: cachedLinkJson(api, j.links.symbols, 'symbols').then((symbols) => {
								return new Map(symbols.shapes.map((s) => [s.id, { name: s.name, paths: s.paths }]));
							}),
							socket_schemas: cachedLinkJson(api, j.links.socket_schemas, 'socket_schemas').then(
								(socket_schemas) => {
									return new Map(
										socket_schemas.socket_schemas.map((s) => [
											s.id,
											{ name: s.name, stencil: s.stencil, sockets: s.sockets }
										])
									);
								}
							),
							semantic_tags: cachedLinkJson(api, j.links.semantic_tags, 'semantic_tags').then(
								(semantic_tags) => {
									return semantic_tags.semantic_tags;
								}
							),
							primitives: cachedLinkJson(api, j.links.primitives, 'primitives').then(
								(primitives) => {
									return primitives.groups;
								}
							),
							blueprints: loadLinkJson(api, j.links.blueprints, 'blueprints').then((blueprints) => {
								return new Map(
									blueprints.blueprints.map((s) => [s.id, { name: s.name, sockets: s.sockets }])
								);
							}),
							linked_simulations: loadLinkJson(
								api,
								j.links.linked_simulations,
								'linked_simulations'
							),
							formalisms: cachedLinkJson(api, j.links.formalisms, 'formalisms').then(
								(r) => r.formalisms
							),

							syntaxes: syntaxes,
							defaultSyntax,
							loadJson: api.loadJson
						};
					});
				} else {
					return r
						.json()
						.catch((e) => {
							throw error(
								r.status || 420,
								errorPageBody(
									{ error: 'json', status: r.status || 420, original: e },
									'Document could not be loaded'
								)
							);
						})
						.then((e) => {
							throw error(
								r.status || 420,
								errorPageBody(
									{ error: 'http', status: r.status || 420, original: e },
									'Document could not be loaded'
								)
							);
						});
				}
			})
			.catch((e) => {
				const description = describeError(e, e?.body?.message ?? e.message);
				return error(
					description.status || e.status || 420,
					errorPageBody(e, 'Document could not be loaded')
				);
			});
	} else {
		return redirect(307, resolve(`/auth`));
	}
}
