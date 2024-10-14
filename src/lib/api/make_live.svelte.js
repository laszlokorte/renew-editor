import LiveState from '$lib/api/livestate';
import {atom} from '$lib/reactivity/atom.svelte.js';

export default function makeLive(socket, resource) {
	let currentValue = atom(resource.content);
	let currentPresence = atom([]);

	const livestate = new LiveState(socket, { topic: resource.topic });

	const updater = (serverState) => {
		currentValue.value = serverState.detail.state;
	};

	livestate.subscribe(updater);

	livestate.addEventListener('presence-changed', function({detail}) {
		currentPresence.value = detail
	});

	livestate.join();

	return {
		get content() {
			return currentValue;
		},

		get presence() {
			return currentPresence;
		},

		send(action, payload) {
			return livestate.sendAction(action, payload)
		},

		unsubscribe() {
			livestate.unsubscribe(updater);
			livestate.leave();
		}
	};
}