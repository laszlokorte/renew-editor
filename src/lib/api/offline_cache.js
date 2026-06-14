const CACHE_PREFIX = 'petristation:offline:';
const ACTION_QUEUE_PREFIX = 'petristation:offline-actions:';
const CACHE_VERSION = 1;

function storage() {
	if (typeof localStorage === 'undefined') {
		return undefined;
	}

	return localStorage;
}

export function readOfflineCache(key) {
	const currentStorage = storage();

	if (!currentStorage) {
		return undefined;
	}

	try {
		const raw = currentStorage.getItem(`${CACHE_PREFIX}${key}`);

		if (!raw) {
			return undefined;
		}

		const entry = JSON.parse(raw);
		return entry?.version === CACHE_VERSION ? entry.value : undefined;
	} catch (error) {
		console.warn('Could not read offline cache', key, error);
		return undefined;
	}
}

export function writeOfflineCache(key, value) {
	const currentStorage = storage();

	if (!currentStorage || value === undefined || value === null) {
		return;
	}

	try {
		currentStorage.setItem(
			`${CACHE_PREFIX}${key}`,
			JSON.stringify({
				version: CACHE_VERSION,
				savedAt: new Date().toISOString(),
				value
			})
		);
	} catch (error) {
		console.warn('Could not write offline cache', key, error);
	}
}

export function offlineResource(resource, fallbackId, fallbackContent = { items: [] }) {
	return {
		...(resource ?? {}),
		id: resource?.id ?? fallbackId,
		topic: resource?.topic ?? `offline:${fallbackId}`,
		content: resource?.content ?? fallbackContent,
		offline: true
	};
}

function actionQueueKey(topic) {
	return `${ACTION_QUEUE_PREFIX}${topic}`;
}

export function readOfflineActionQueue(topic) {
	const currentStorage = storage();

	if (!currentStorage || !topic) {
		return [];
	}

	try {
		const raw = currentStorage.getItem(actionQueueKey(topic));
		const value = raw ? JSON.parse(raw) : [];
		return Array.isArray(value) ? value : [];
	} catch (error) {
		console.warn('Could not read offline action queue', topic, error);
		return [];
	}
}

export function offlineActionQueueCount(topic) {
	return readOfflineActionQueue(topic).length;
}

export function writeOfflineActionQueue(topic, queue) {
	const currentStorage = storage();

	if (!currentStorage || !topic) {
		return;
	}

	try {
		if (!queue?.length) {
			currentStorage.removeItem(actionQueueKey(topic));
			return;
		}

		currentStorage.setItem(actionQueueKey(topic), JSON.stringify(queue));
	} catch (error) {
		console.warn('Could not write offline action queue', topic, error);
	}
}

export function enqueueOfflineAction(topic, item) {
	if (!topic || !item?.action) {
		return undefined;
	}

	const queued = {
		id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
		queuedAt: new Date().toISOString(),
		...item
	};
	writeOfflineActionQueue(topic, [...readOfflineActionQueue(topic), queued]);
	return queued;
}

export function takeOfflineActionQueue(topic) {
	const queue = readOfflineActionQueue(topic);
	writeOfflineActionQueue(topic, []);
	return queue;
}
