<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import * as E from '$lib/dom/events.js';
	import * as C from '$lib/combinators';
	import { atom, view, read } from '$lib/reactivity/atom.svelte.js';

	const {
		frameBoxPath,
		clientToCanvas,
		cameraScale,
		rotationTransform,
		draftDrawing,
		smoothnessAmount = 50,
		onDraw
	} = $props();

	const pen = atom({});
	const path = view(['path', L.define([])], pen);
	const isActive = view([L.lens(R.compose(R.lt(0), R.length), (n, o) => (n ? o : []))], path);
	export const canCancel = read(R.identity, isActive);
	export function cancel() {
		isActive.value = false;
	}

	function sampleDistance() {
		const amount = Math.max(0, Math.min(100, Number(smoothnessAmount) || 0));
		return cameraScale.value * (2 + amount / 10);
	}

	const currentPath = view(
		[
			L.setter(
				// discard very close samples
				R.dropRepeatsWith(
					R.compose(
						(x) => x < sampleDistance(),
						Math.sqrt,
						R.uncurryN(
							2,
							C.Phi1(R.add)(C.Psi(R.compose((x) => x * x, R.subtract))(R.prop('x')))(
								C.Psi(R.compose((x) => x * x, R.subtract))(R.prop('y'))
							)
						)
					)
				)
			),
			L.setter((n, o) => (n ? [...o, n] : [])),
			L.removable('x', 'y'),
			L.defaults(false)
		],
		path
	);

	const pathPath = view(
		L.iso(
			R.ifElse(
				R.length,
				R.compose(R.concat('M'), R.join('L'), R.map(R.compose(R.join(','), R.props(['x', 'y'])))),
				R.always('')
			),
			R.compose(
				R.map(R.compose(R.zipWith(R.assoc, ['x', 'y']), R.split(','))),
				R.split('L'),
				R.slice(1)
			)
		),
		path
	);

	let preventNextClick = $state(false);
	let pointerStart = $state(null);
	let didDrag = $state(false);
	let ignoreNextLostPointerCapture = $state(false);

	function drawablePath() {
		if (path.value.length !== 1) {
			return path.value;
		}

		const point = path.value[0];
		const offset = Math.max(cameraScale.value, 0.1);
		return [point, { x: point.x + offset, y: point.y }];
	}

	function emitPath(points) {
		if (draftDrawing) {
			draftDrawing.value = points;
		} else if (onDraw) {
			onDraw(points);
		}
		preventNextClick = true;
	}

	function finishPath() {
		if (path.value.length > 0) {
			emitPath(drawablePath());
		}
		path.value = [];
		pointerStart = null;
		didDrag = false;
	}
</script>

<path
	class="pen-surface"
	d={frameBoxPath.value}
	pointer-events="all"
	stroke="none"
	fill="none"
	role="button"
	tabindex="-1"
	onclick={(evt) => {
		if (preventNextClick) {
			preventNextClick = false;
			evt.stopPropagation();
		}
	}}
	ondblclick={(evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		finishPath();
	}}
	onkeydown={(evt) => {
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			if (isActive.value) {
				evt.stopPropagation();
				isActive.value = false;
			}
		}
		if (evt.key === 'Enter') {
			evt.preventDefault();
			evt.stopPropagation();
			finishPath();
		}
	}}
	oncontextmenu={(evt) => {
		evt.preventDefault();
		finishPath();
	}}
	onpointerdown={(evt) => {
		if (!evt.isPrimary && isActive.value) {
			isActive.value = false;
		}

		if (!evt.isPrimary || !E.isLeftButton(evt)) {
			return;
		}

		evt.preventDefault();
		evt.currentTarget.focus({
			preventScroll: true
		});

		evt.currentTarget.setPointerCapture(evt.pointerId);

		const point = clientToCanvas(evt.clientX, evt.clientY);
		pointerStart = point;
		didDrag = false;
		currentPath.value = point;
	}}
	onpointermove={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (!isActive.value) {
			return;
		}

		const point = clientToCanvas(evt.clientX, evt.clientY);
		if (pointerStart && Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y) > 2) {
			didDrag = true;
		}
		currentPath.value = point;
	}}
	onpointerup={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
			ignoreNextLostPointerCapture = true;
			evt.currentTarget.releasePointerCapture(evt.pointerId);
		}

		if (didDrag) {
			const points = drawablePath();
			if (points.length > 1) {
				emitPath(points);
			}
			path.value = [];
		}
		pointerStart = null;
		didDrag = false;
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
		if (ignoreNextLostPointerCapture) {
			ignoreNextLostPointerCapture = false;
			return;
		}
		isActive.value = false;
	}}
/>

<g transform={rotationTransform.value} pointer-events="none">
	<path d={pathPath.value} fill="none" class="draft-line" pointer-events="none" />
</g>

<style>
	.pen-surface {
		stroke-width: 0;
		cursor: default;
		outline: none;
	}

	.draft-line {
		fill: none;
		stroke: #ff6e60;
		fill-opacity: 0.2;
		stroke-width: 6px;
		stroke-opacity: 0.6;
		vector-effect: non-scaling-stroke;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	[role='button'] {
		outline: none;
	}
</style>
