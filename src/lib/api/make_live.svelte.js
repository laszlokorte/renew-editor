import LiveState from '$lib/api/livestate';
import { atom, update } from '$lib/reactivity/atom.svelte.js';

export default function makeLive(socket, resource, options = {}) {
	let currentValue = atom(resource.content);
	let currentPresence = atom([]);
	let currentErrors = options.errors ?? atom([]);

	const livestate = new LiveState(socket, { topic: resource.topic });

	const updater = (serverState) => {
		if (serverState.detail.patch) {
			update(serverState.detail.patch, currentValue);
		} else {
			currentValue.value = serverState.detail.state;
		}
	};

	livestate.subscribe(updater);

	const updatePresence = ({ detail }) => {
		currentPresence.value = detail;
	};

	const queueError = ({ detail }) => {
		currentErrors.value = [...currentErrors.value, detail];
	};

	livestate.addEventListener('presence-changed', updatePresence);
	livestate.addEventListener('livestate-error', queueError);

	livestate.join();

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

		send(action, payload) {
			return livestate.sendAction(action, payload);
		},

		cast(action, payload) {
			livestate.castAction(action, payload);
		},

		unsubscribe() {
			livestate.unsubscribe(updater);
			livestate.removeEventListener('presence-changed', updatePresence);
			livestate.removeEventListener('livestate-error', queueError);
			livestate.leave();
		}
	};
}
