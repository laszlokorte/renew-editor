<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import * as E from '$lib/dom/events';
	import * as Geo from '$lib/math/geometry';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import { atom, view, read, combine, readCombined } from '$lib/reactivity/atom.svelte.js';

	const minDragDistance = 5;

	const {
		frameBoxPath,
		clientToCanvas,
		rotationTransform,
		makeSpace,
		frameBoxObject,
		cameraScale
	} = $props();

	const guide = atom(undefined);
	const isActive = view(
		L.lens(R.compose(R.not, R.isNil), (n, o) => (n ? o : undefined)),
		guide
	);

	const inversed = view(['inversed', L.valueOr(false)], guide);
	const guideStart = view([L.removable('start'), 'start', L.removable('x', 'y')], guide);
	const guideEnd = view(
		L.ifElse(R.prop('start'), [L.removable('end'), 'end', L.removable('x', 'y')], L.zero),
		guide
	);

	const guideAngle = view(
		[
			L.props('start', 'end'),
			L.reread(({ start, end }) => {
				const dx = end.x - start.x;
				const dy = end.y - start.y;

				return Math.atan2(dy, dx) + Math.PI / 2;
			})
		],
		guide
	);

	const guideDistance = view(
		[
			L.props('start', 'end'),
			L.reread(({ start, end }) => {
				const dx = end.x - start.x;
				const dy = end.y - start.y;

				return (start.x * -dy + start.y * dx) / Math.sqrt(dx * dx + dy * dy);
			})
		],
		guide
	);

	const startDistance = view(
		[
			L.props('start', 'end'),
			L.reread(({ start, end }) => {
				const dx = start.x - end.x;
				const dy = start.y - end.y;

				return (start.x * dx + start.y * dy) / Math.sqrt(dx * dx + dy * dy);
			})
		],
		guide
	);
	const endDistance = view(
		[
			L.props('start', 'end'),
			L.reread(({ start, end }) => {
				const dx = start.x - end.x;
				const dy = start.y - end.y;

				return (end.x * dx + end.y * dy) / Math.sqrt(dx * dx + dy * dy);
			})
		],
		guide
	);

	const spaceLength = read(
		[
			L.props('start', 'end'),
			L.reread(({ start, end }) => {
				const dx = end.x - start.x;
				const dy = end.y - start.y;

				return Math.sqrt(dx * dx + dy * dy);
			})
		],
		guide
	);

	const spacerValid = readCombined(
		[
			L.reread(({ len, scale }) => {
				return len / scale > minDragDistance;
			}),
			L.valueOr(false)
		],
		{ len: spaceLength, scale: cameraScale }
	);

	const guidePath = read(
		L.getter((b) =>
			b && b.start && b.end
				? `M${numberSvgFormat.format(b.start.x)},${numberSvgFormat.format(b.start.y)}L${numberSvgFormat.format(b.end.x)},${numberSvgFormat.format(b.end.y)}`
				: ''
		),
		guide
	);

	const newGuideEdgePointsA = readCombined(
		[L.reread(R.compose(R.apply(Geo.rayInsideQuad), R.props(['angle', 'dist', 'quad'])))],
		{
			angle: guideAngle,
			dist: startDistance,
			quad: read('worldSpace', frameBoxObject)
		}
	);

	const newGuideEdgePointsB = readCombined(
		[L.reread(R.compose(R.apply(Geo.rayInsideQuad), R.props(['angle', 'dist', 'quad'])))],
		{
			angle: guideAngle,
			dist: endDistance,
			quad: read('worldSpace', frameBoxObject)
		}
	);

	const newGuideRayPath = readCombined(
		L.reread(
			({ s: { a: sa, b: sb }, t: { a: ta, b: tb } }) =>
				`M${sa.x},${sa.y}L${sb.x},${sb.y}L${tb.x},${tb.y} L${ta.x},${ta.y} z`
		),
		{ s: newGuideEdgePointsA, t: newGuideEdgePointsB }
	);

	const newGuideRayPathEdge = readCombined(
		L.reread(
			({ s: { a: sa, b: sb }, t: { a: ta, b: tb } }) =>
				`M${sa.x},${sa.y}L${sb.x},${sb.y}M${ta.x},${ta.y} L${tb.x},${tb.y} z`
		),
		{ s: newGuideEdgePointsA, t: newGuideEdgePointsB }
	);

	export const canCancel = read(R.identity, isActive);
	export function cancel() {
		isActive.value = false;
	}
</script>

<path
	d={frameBoxPath.value}
	pointer-events="all"
	fill="none"
	class="guideliner-surface"
	role="button"
	tabindex="-1"
	onclick={(evt) => {
		evt.stopPropagation();
	}}
	onkeydown={(evt) => {
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			guideEnd.value = undefined;
		}
		if (!isActive.value) {
			return;
		}

		inversed.value = evt.altKey || evt.shiftKey;
	}}
	onkeyup={(evt) => {
		if (!isActive.value) {
			return;
		}
		inversed.value = evt.altKey || evt.shiftKey;
	}}
	onpointerdown={(evt) => {
		if (!evt.isPrimary) {
			isActive.value = false;
			return;
		}

		evt.currentTarget.setPointerCapture(evt.pointerId);

		const worldPos = clientToCanvas(evt.clientX, evt.clientY);

		inversed.value = evt.altKey || evt.shiftKey;
		guideStart.value = worldPos;
		guideEnd.value = worldPos;
	}}
	onpointermove={(evt) => {
		if (!evt.isPrimary) {
			return;
		}

		if (!isActive.value) {
			return;
		}

		const target = clientToCanvas(evt.clientX, evt.clientY);
		const start = guideStart.value;

		const dx = target.x - start.x;
		const dy = target.y - start.y;

		const len = Math.hypot(dx, dy);
		const angle = Math.atan2(dy, dx);

		const snapCount = evt.ctrlKey ? 18 : 4;
		inversed.value = evt.altKey || evt.shiftKey;
		guideEnd.value = {
			x: start.x + Math.cos(angle) * len,
			y: start.y + Math.sin(angle) * len
		};
	}}
	onpointerup={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (!isActive.value) {
			return;
		}

		if (makeSpace && spacerValid.value) {
			makeSpace({
				base: guideStart.value,
				dir: {
					x: guideEnd.value.x - guideStart.value.x,
					y: guideEnd.value.y - guideStart.value.y
				},
				inverse: inversed.value
			});
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
/>

<g pointer-events="none" transform={rotationTransform.value}>
	{#if spacerValid.value}
		<path
			fill="none"
			stroke="black"
			d={newGuideRayPath.value}
			class="spacer-area"
			class:inversed={inversed.value}
			pointer-events="none"
		/>
		<path
			fill="none"
			stroke="black"
			d={newGuideRayPathEdge.value}
			class="spacer-edge"
			class:inversed={inversed.value}
			pointer-events="none"
		/>
	{:else}
		<path
			d={guidePath.value}
			fill="none"
			class="guide-handle"
			class:valid={spacerValid.value}
			pointer-events="none"
		/>
	{/if}
</g>

<style>
	.guideliner-surface {
		stroke-width: 0;
		cursor: default;
		outline: none;
	}

	.spacer-area {
		fill: #fffa;
		stroke: none;
	}
	.spacer-area.inversed {
		fill: #feea;
		stroke: none;
	}

	.spacer-edge {
		stroke: mediumaquamarine;
		stroke-opacity: 0.3;
		stroke-width: 4px;
		vector-effect: non-scaling-stroke;
	}
	.spacer-edge.inversed {
		stroke: indianred;
	}

	.guide-handle {
		fill: none;
		stroke: #ff9999;
		stroke-opacity: 0.2;
		stroke-width: 4px;
		vector-effect: non-scaling-stroke;
		stroke-linecap: round;
	}

	.guide-handle.valid {
		stroke: mediumaquamarine;
	}
</style>
