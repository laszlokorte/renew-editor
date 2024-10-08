import LiveState from '$lib/api/livestate';

export default function makeLive(socket, resource) {
	let currentValue = $state(resource.content);
	let currentPresence = $state([]);

	const livestate = new LiveState(socket, { topic: resource.topic });

	const updater = (serverState) => {
		currentValue = serverState.detail.state.content;
	};

	livestate.subscribe(updater);

	livestate.addEventListener('presence-changed', function({detail}) {
		currentPresence = detail
	});

	livestate.join();

	return {
		get value() {
			return currentValue;
		},

		get presence() {
			return currentPresence;
		},

		async unsubscribe() {
			livestate.unsubscribe(updater);
			livestate.leave();
		}
	};
}