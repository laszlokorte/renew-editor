import LiveState from '$lib/api/livestate';
import {
	enqueueOfflineAction,
	offlineActionQueueCount,
	readOfflineActionQueue,
	takeOfflineActionQueue,
	writeOfflineActionQueue
} from '$lib/api/offline_cache.js';
import { atom, update } from '$lib/reactivity/atom.svelte.js';

const OFFLINE_IGNORED_ACTIONS = new Set(['cursor', 'move_cursor']);

export default function makeLive(socket, resource, options = {}) {
	let currentValue = atom(resource.content);
	let currentPresence = atom([]);
	let currentErrors = options.errors ?? atom([]);
	const subscribable = socket && resource?.topic && !resource.offline;
	const topic = resource?.topic;
	const queuedActions = atom(offlineActionQueueCount(topic));

	const livestate = subscribable ? new LiveState(socket, { topic: resource.topic }) : undefined;
	const updater = (serverState) => {
		if (serverState.detail.patch) {
			update(serverState.detail.patch, currentValue);
		} else {
			currentValue.value = serverState.detail.state;
		}
	};
	const updatePresence = ({ detail }) => {
		currentPresence.value = detail;
	};
	const queueError = ({ detail }) => {
		currentErrors.value = [...currentErrors.value, detail];
	};
	const isLiveConnected = () => !!livestate && socket?.isConnected?.() !== false;
	const flushQueuedActions = async () => {
		if (!livestate || !topic) {
			return;
		}

		const queue = takeOfflineActionQueue(topic);
		if (!queue.length) {
			return;
		}

		for (let i = 0; i < queue.length; i += 1) {
			const item = queue[i];
			try {
				if (item.mode === 'send') {
					await livestate.sendAction(item.action, item.payload);
				} else {
					livestate.castAction(item.action, item.payload);
				}
			} catch (error) {
				writeOfflineActionQueue(topic, [...queue.slice(i), ...readOfflineActionQueue(topic)]);
				queuedActions.value = offlineActionQueueCount(topic);
				queueError({
					detail: {
						type: 'offline-replay-error',
						message:
							error?.message ?? error?.error ?? 'Queued offline action could not be replayed.'
					}
				});
				return;
			}
		}

		queuedActions.value = offlineActionQueueCount(topic);
	};

	if (livestate) {
		livestate.subscribe(updater);
		livestate.addEventListener('presence-changed', updatePresence);
		livestate.addEventListener('livestate-error', queueError);
		livestate.addEventListener('livestate-connect', flushQueuedActions);
		livestate.join();
	}

	return {
		get content() {
			return currentValue;
		},

		get presence() {
			return currentPresence;
		},

		get errors() {
			return currentErrors;
		},

		get queuedActions() {
			return queuedActions;
		},

		send(action, payload) {
			if (!isLiveConnected()) {
				const queued = enqueueOfflineAction(topic, { mode: 'send', action, payload });
				queuedActions.value = offlineActionQueueCount(topic);
				return queued
					? Promise.resolve({ queued: true, id: queued.id })
					: Promise.reject(new Error('Live connection is not available'));
			}

			return livestate.sendAction(action, payload);
		},

		cast(action, payload) {
			if (!isLiveConnected()) {
				if (OFFLINE_IGNORED_ACTIONS.has(action)) {
					return;
				}

				enqueueOfflineAction(topic, { mode: 'cast', action, payload });
				queuedActions.value = offlineActionQueueCount(topic);
				return;
			}

			livestate.castAction(action, payload);
		},

		unsubscribe() {
			if (livestate) {
				livestate.unsubscribe(updater);
				livestate.removeEventListener('presence-changed', updatePresence);
				livestate.removeEventListener('livestate-error', queueError);
				livestate.removeEventListener('livestate-connect', flushQueuedActions);
				livestate.leave();
			}
		}
	};
}
