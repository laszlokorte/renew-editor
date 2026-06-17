import { build, files, version } from '$service-worker';

const CACHE = `petristation-${version}`;
const DATA_CACHE = `petristation-data-${version}`;
const base = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const SHELL = `${base}/`;
const API_PREFIX = `${base}/api/`;

const assets = [...build, ...files, SHELL].map((path) => {
	if (path.startsWith(base)) {
		return path;
	}

	return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
});

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) =>
				cache.addAll([...new Set(assets)]).catch(() => cache.addAll([...build, ...files]))
			)
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => ![CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

function cacheableApiResponse(response) {
	return response.ok && response.type === 'basic';
}

function unavailableResponse(request) {
	if (request.mode === 'navigate') {
		return new Response(
			'<!doctype html><title>PetriStation offline</title><h1>PetriStation is offline</h1><p>The requested page is not available in the offline cache.</p>',
			{
				status: 503,
				headers: { 'content-type': 'text/html;charset=utf-8' }
			}
		);
	}

	if (new URL(request.url).pathname.startsWith(API_PREFIX)) {
		return new Response(
			JSON.stringify({ error: 'offline', message: 'No cached response available.' }),
			{
				status: 503,
				headers: { 'content-type': 'application/json;charset=utf-8' }
			}
		);
	}

	return new Response('', { status: 503 });
}

async function fetchAndCache(request, cacheName) {
	const response = await fetch(request);

	if (cacheableApiResponse(response)) {
		const copy = response.clone();
		caches
			.open(cacheName)
			.then((cache) => cache.put(request, copy))
			.catch(() => {});
	}

	return response;
}

async function networkFirst(request, cacheName, fallback = undefined) {
	try {
		return await fetchAndCache(request, cacheName);
	} catch (_) {
		const cached = await caches.match(request);
		if (cached) {
			return cached;
		}

		const fallbackResponse = typeof fallback === 'function' ? await fallback() : await fallback;
		if (fallbackResponse) {
			return fallbackResponse;
		}

		return unavailableResponse(request);
	}
}

self.addEventListener('fetch', (event) => {
	const request = event.request;

	if (request.method !== 'GET') {
		return;
	}

	const url = new URL(request.url);

	if (url.origin !== self.location.origin) {
		return;
	}

	if (url.pathname.startsWith(API_PREFIX)) {
		event.respondWith(networkFirst(request, DATA_CACHE));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, CACHE, () => caches.match(SHELL)));
		return;
	}

	event.respondWith(
		caches
			.match(request)
			.then((cached) => cached ?? fetchAndCache(request, CACHE))
			.catch(() => unavailableResponse(request))
	);
});
