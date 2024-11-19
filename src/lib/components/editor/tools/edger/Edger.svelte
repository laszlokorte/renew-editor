<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import * as E from '$lib/dom/events.js';
	import { atom, view, combine, read } from '$lib/reactivity/atom.svelte.js';
	const {
		sockets,
		rotationTransform,
		cameraScale,
		frameBoxPath,
		clientToCanvas,
		cameraTow = atom(),
		newEdge,
		newEdgeNode
	} = $props();

	const snapRadius = 20;
	const snapRadiusScaled = view(R.compose(R.multiply(snapRadius), R.min(1)), cameraScale);
	const snapRadiusCenterScaled = view(R.compose(R.multiply(snapRadius / 2), R.min(1)), cameraScale);
	const draft = atom({});

	const draftSourceId = view([L.removable('source'), 'source'], draft);
	const draftSourcePosition = view(
		L.lens(
			({ n, s }) => {
				return s !== undefined ? R.find((x) => R.equals(x.id, s), n) : undefined;
			},
			(newPos, { n, s }) => {
				return { n, s };
			}
		),
		combine({ n: sockets, s: draftSourceId })
	);
	const draftTarget = view([L.removable('target'), 'target'], draft);
	const draftTargetPosition = view([L.removable('position'), 'position'], draftTarget);
	const draftTargetIds = view(
		L.lens(R.prop('ids'), (newIds, old) =>
			old.ids && newIds && old.ids.length !== newIds.length
				? { ...old, ids: newIds, cycle: 0 }
				: { ...old, ids: newIds }
		),
		draftTarget
	);
	const draftTargetSnapCycle = view(['cycle', L.defaults(0)], draftTarget);
	const draftTargetId = view(
		L.reread(({ ids, cycle }) => (ids ? ids[(cycle || 0) % ids.length] : undefined)),
		draftTarget
	);
	const isActive = view(
		[L.lens(R.compose(R.not, R.isNil), (n, o) => (n ? o : undefined))],
		draftSourceId
	);

	const connection = combine({
		source: draftSourceId,
		target: draftTargetId
	});
	const validConnection = view(
		R.both(
			R.compose(R.not, R.isNil, R.prop('source')),
			R.compose(R.not, R.isNil, R.prop('target'))
		),
		connection
	);

	const draftTargetSnappedPosition = view(
		[
			L.lens(
				({ n, t }) => {
					const snapId = t.ids ? t.ids[(t.cycle || 0) % t.ids.length] : undefined;
					return t !== undefined
						? snapId !== undefined
							? R.find((x) => x.id === snapId, n)
							: t.position
						: undefined;
				},
				(newPos, { n, s }) => {
					return { n, s };
				}
			)
		],
		combine({ n: sockets, t: draftTarget })
	);

	export const canCancel = read(R.identity, isActive);

	export function cancel() {
		isActive.value = false;
	}

	let preventNextClick = $state(false);
</script>

<g
	class="edge-container"
	class:active={isActive.value}
	role="button"
	tabindex="-1"
	onclick={(evt) => {
		if (preventNextClick) {
			evt.stopPropagation();
			preventNextClick = false;
		}
	}}
	oncontextmenu={(evt) => {
		evt.preventDefault();
		isActive.value = false;
	}}
	onkeydown={(evt) => {
		if (!isActive.value) {
			return;
		}
		evt.preventDefault();
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			isActive.value = false;
		}
		if (evt.key === 'Tab') {
			draftTargetSnapCycle.value += 1;
		}
	}}
	onpointerdown={(evt) => {
		if (!evt.isPrimary || !E.isLeftButton(evt)) {
			isActive.value = false;

			return;
		}
		const nodeId = JSON.parse(evt.target.getAttribute('data-idx'));
		evt.currentTarget.setPointerCapture(evt.pointerId);
		if (nodeId !== null) {
			draftSourceId.value = nodeId;
			draftTargetPosition.value = clientToCanvas(evt.clientX, evt.clientY);
		}
	}}
	onpointermove={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (!isActive.value) {
			return;
		}

		const worldPos = clientToCanvas(evt.clientX, evt.clientY);
		draftTargetPosition.value = worldPos;
		cameraTow.value = worldPos;

		const closeTargets = R.reject(R.isNil)(
			R.map((node) => {
				if (
					!R.equals(node.id, draftSourceId.value) &&
					Math.hypot(node.x - worldPos.x, node.y - worldPos.y) < snapRadiusScaled.value
				) {
					return node.id;
				} else {
					return null;
				}
			}, sockets.value)
		);

		if (closeTargets.length > 0) {
			draftTargetIds.value = closeTargets;
		} else {
			draftTargetIds.value = undefined;
		}
	}}
	onpointerup={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (!isActive.value) {
			return;
		}
		cameraTow.value = undefined;

		if (validConnection.value && newEdge) {
			newEdge(connection.value);
		} else if (newEdgeNode) {
			newEdgeNode({
				source: draftSourceId.value,
				newTarget: draftTargetPosition.value
			});
		}

		preventNextClick = true;

		isActive.value = false;
	}}
	onpointercancel={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
		cameraTow.value = undefined;
	}}
	onlostpointercapture={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
		cameraTow.value = undefined;
	}}
>
	<path
		d={frameBoxPath.value}
		pointer-events="all"
		fill="none"
		class="edge-surface"
		class:active={isActive.value || preventNextClick.value}
	/>

	<g transform={rotationTransform.value} pointer-events="none">
		{#each sockets.value as v, i (i)}
			<circle
				data-idx={JSON.stringify(v.id)}
				class="socket-outer"
				cx={v.x}
				cy={v.y}
				pointer-events="all"
				r={snapRadiusScaled.value}
				class:active-source={draftSourceId.value === v.id}
				class:active-target={draftTargetId.value === v.id}
			></circle>
			<circle
				data-idx={JSON.stringify(v.id)}
				class="socket-center"
				cx={v.x}
				cy={v.y}
				pointer-events="all"
				r={snapRadiusCenterScaled.value}
				class:active-source={draftSourceId.value === v.id}
				class:active-target={draftTargetId.value === v.id}
			></circle>
		{/each}

		{#if draftSourcePosition.value && draftTargetSnappedPosition.value}
			<path
				class:valid={validConnection.value}
				class="edge"
				stroke="black"
				pointer-events="none"
				d="M{draftSourcePosition.value.x} {draftSourcePosition.value
					.y} L {draftTargetSnappedPosition.value.x} {draftTargetSnappedPosition.value.y}"
			/>
		{/if}
	</g>
</g>

<style>
	.edge-surface {
		stroke-width: 0;
		outline: none;
		stroke: none;
		display: none;
	}

	.edge-surface.active {
		cursor: alias;
		display: initial;
	}

	.edge-container.active {
		cursor: alias;
	}

	.socket-outer {
		pointer-events: all;
		fill: none;
		stroke: none;
		cursor: alias;
	}

	.socket-center {
		fill: white;
		fill-opacity: 0.8;
		stroke: #23875d;
		pointer-events: none;
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.socket-outer:hover + .socket-center {
		fill-opacity: 1;
	}

	.socket-center.active-source {
		fill-opacity: 1;
		fill: #23875d;
		stroke: white;
		stroke-width: 4;
	}
	.socket-center.active-target {
		fill-opacity: 1;
		fill: #23875d;
		stroke: white;
		stroke-width: 4;
	}

	.edge {
		vector-effect: non-scaling-stroke;
		stroke-width: 3px;
		stroke: black;
		stroke-linecap: round;
		stroke-opacity: 0.5;
		pointer-events: none;
	}

	.edge.valid {
		stroke: #23875d;
		stroke-width: 5px;
		stroke-opacity: 1;
	}
</style>
