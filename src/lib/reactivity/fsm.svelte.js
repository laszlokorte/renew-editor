import { createActor } from 'xstate';
import { read } from './atom.svelte';


export function fsm(machineDef) {

	const machineActor = createActor(machineDef).start();

	let machineState = $state.raw({value: machineActor.getSnapshot()});

	machineActor.subscribe((newState) => {
		machineState = {value: newState}
	})

	return {
		get value() {
			return machineState.value
		},

		get state() {
			return read('value', this)
		},

		get context() {
			return read('context', this)
		},

		send(evt) {
			return machineActor.send(evt)
		},

		on(event, listener) {
			return machineActor.on(event, listener)
		},

		can(event) {
			return machineState.value.can(event)
		},

		dispose() {
			machineActor.stop()
		},
	}
}