const cache = new Map();

export function cachedResource(key, load, ttlMs = 5 * 60 * 1000) {
	const now = Date.now();
	const existing = cache.get(key);

	if (existing && now - existing.createdAt < ttlMs) {
		return existing.promise;
	}

	const promise = Promise.resolve()
		.then(load)
		.catch((error) => {
			cache.delete(key);
			throw error;
		});

	cache.set(key, { createdAt: now, promise });
	return promise;
}

export function clearResourceCache() {
	cache.clear();
}
