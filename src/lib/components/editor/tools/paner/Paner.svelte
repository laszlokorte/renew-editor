<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import * as E from '$lib/dom/events';
	import { atom, view } from '$lib/reactivity/atom.svelte.js';
	import { disableEventIf } from '$lib/reactivity/bindings.svelte';

	const { frameBoxPath, clientToCanvas, onPan } = $props();

	const grab = atom({ active: false });
	const grabPosition = view([L.removable('position'), 'position'], grab);
	const isActive = view(
		L.lens(R.compose(R.not, R.isNil), (b, o) => (b ? o : undefined)),
		grabPosition
	);
</script>

<path
	d={frameBoxPath.value}
	class="pan-surface"
	class:grabbing={isActive.value}
	pointer-events="all"
	fill="none"
	role="button"
	tabindex="-1"
	onclick={(evt) => {
		evt.stopPropagation();
	}}
	onkeydown={(evt) => {
		evt.stopPropagation();
	}}
	oncontextmenu={(evt) => {
		evt.preventDefault();
		isActive.value = false;
	}}
	onmousedown={(evt) => {
		if (evt.button === 1 && isActive.value) {
			evt.preventDefault();
		}
	}}
	onpointerdown={(evt) => {
		if (!evt.isPrimary || !E.isLeftButton(evt)) {
			return;
		}
		evt.currentTarget.setPointerCapture(evt.pointerId);
		grabPosition.value = clientToCanvas(evt.clientX, evt.clientY);
	}}
	onpointermove={(evt) => {
		if (!evt.isPrimary) {
			isActive.value = false;
			return;
		}
		if (!isActive.value) {
			return;
		}
		const newPos = clientToCanvas(evt.clientX, evt.clientY);
		onPan({
			dx: grabPosition.value.x - newPos.x,
			dy: grabPosition.value.y - newPos.y
		});
	}}
	onpointerup={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
	}}
	onpointercancel={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
	}}
	onlostpointercapture={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
	}}
	use:disableEventIf={{ eventType: 'wheel', cond: isActive }}
/>

<style>
	.pan-surface {
		stroke-width: 0;
		cursor: grab;
		outline: none;
	}
	.pan-surface.grabbing {
		cursor: grabbing;
	}
</style>
