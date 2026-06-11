<script>
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import * as E from '$lib/dom/events.js';
	import { atom, view, combine, read } from '$lib/reactivity/atom.svelte.js';
	import Symbol from '$lib/components/renew/Symbol.svelte';

	const {
		sockets,
		symbols,
		sourceTipSymbolShapeId = null,
		targetTipSymbolShapeId = null,
		rotationTransform,
		cameraScale,
		frameBoxPath,
		clientToCanvas,
		cameraTow = atom(),
		validEdge,
		newEdge,
		newEdgeNode,
		sourceLayerIds = undefined,
		selectionHandles = false
	} = $props();

	const snapRadius = 20;
	const selectionHandleHitRadius = 5;
	const selectionHandleCenterRadius = 4;
	const snapRadiusScaled = view(R.compose(R.multiply(snapRadius), R.min(1)), cameraScale);
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
					const snapId = t?.ids ? t.ids[(t.cycle || 0) % t.ids.length] : undefined;
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
	const draftEdgeSourcePosition = view(
		L.reread(({ source, target }) => edgeEndpoint(source, target)),
		combine({ source: draftSourcePosition, target: draftTargetSnappedPosition })
	);
	const draftEdgeTargetPosition = view(
		L.reread(({ source, target }) => edgeEndpoint(target, source)),
		combine({ source: draftSourcePosition, target: draftTargetSnappedPosition })
	);

	export const canCancel = read(R.identity, isActive);

	export function cancel() {
		isActive.value = false;
	}

	let preventNextClick = $state(false);
	let reversePreview = $state(false);

	function socketStencil(socket) {
		return (
			socket?.socket_schema?.stencil ??
			socket?.socketSchema?.stencil ??
			socket?.stencil ??
			socket?.id?.stencil ??
			null
		);
	}

	function isCenterSocket(socket, centerX, centerY) {
		return Math.abs(socket.x - centerX) < 0.001 && Math.abs(socket.y - centerY) < 0.001;
	}

	function edgeEndpoint(socket, toward) {
		const box = socket?.box;

		if (!socket || !toward || !box) {
			return socket;
		}

		const centerX = box.x + box.width / 2;
		const centerY = box.y + box.height / 2;
		const dx = toward.x - centerX;
		const dy = toward.y - centerY;
		const stencil = socketStencil(socket);

		if (!['ellipse', 'rect'].includes(stencil) || !isCenterSocket(socket, centerX, centerY)) {
			return socket;
		}

		if (dx === 0 && dy === 0) {
			return { ...socket, x: centerX, y: centerY };
		}

		if (stencil === 'ellipse') {
			const radiusX = box.width / 2;
			const radiusY = box.height / 2;
			const scale =
				1 / Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

			return {
				...socket,
				x: centerX + dx * scale,
				y: centerY + dy * scale
			};
		}

		let scale = Infinity;

		if (dx !== 0) {
			const sideX = dx > 0 ? box.x + box.width : box.x;
			scale = Math.min(scale, (sideX - centerX) / dx);
		}

		if (dy !== 0) {
			const sideY = dy > 0 ? box.y + box.height : box.y;
			scale = Math.min(scale, (sideY - centerY) / dy);
		}

		if (!Number.isFinite(scale)) {
			return { ...socket, x: centerX, y: centerY };
		}

		return {
			...socket,
			x: centerX + dx * scale,
			y: centerY + dy * scale
		};
	}

	function edgeArrowPoint(source, target, reverse = false) {
		return reverse ? source : target;
	}

	function edgeArrowAngle(source, target, reverse = false) {
		if (!source || !target) {
			return 0;
		}

		const from = reverse ? target : source;
		const to = reverse ? source : target;

		return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
	}

	function edgeArrowBox(source, target, reverse = false) {
		const point = edgeArrowPoint(source, target, reverse);

		return {
			x: point.x - 4,
			y: point.y - 4,
			width: 8,
			height: 8
		};
	}

	/**
	 * @param {{ x: number, y: number } | undefined} source
	 * @param {{ x: number, y: number } | undefined} target
	 * @param {boolean} reverse
	 * @returns {string}
	 */
	function edgeArrowHeadPath(source, target, reverse = false) {
		if (!source || !target) {
			return '';
		}

		const from = reverse ? target : source;
		const to = reverse ? source : target;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len = Math.hypot(dx, dy);

		if (!len) {
			return '';
		}

		const arrowAngle = 0.4;
		const arrowOuterRadius = 8;
		const arrowInnerRadius = 8;
		const nx = dx / len;
		const ny = dy / len;
		const outerBack = Math.cos(arrowAngle) * arrowOuterRadius;
		const outerSide = Math.sin(arrowAngle) * arrowOuterRadius;
		const innerBack = arrowInnerRadius;
		const leftX = to.x - nx * outerBack + ny * outerSide;
		const leftY = to.y - ny * outerBack - nx * outerSide;
		const innerX = to.x - nx * innerBack;
		const innerY = to.y - ny * innerBack;
		const rightX = to.x - nx * outerBack - ny * outerSide;
		const rightY = to.y - ny * outerBack + nx * outerSide;

		return `M ${to.x} ${to.y} L ${leftX} ${leftY} L ${innerX} ${innerY} L ${rightX} ${rightY} Z`;
	}

	function socketVisible(socket) {
		if (isActive.value || !sourceLayerIds) {
			return true;
		}

		return sourceLayerIds.includes(socket?.id?.layer);
	}

	function scaledRadius(radius) {
		return radius * Math.min(1, cameraScale.value ?? 1);
	}

	function socketHitRadius() {
		return scaledRadius(selectionHandles ? selectionHandleHitRadius : snapRadius);
	}

	function socketCenterRadius() {
		return scaledRadius(selectionHandles ? selectionHandleCenterRadius : snapRadius / 2);
	}

	function previewTipSymbolId(reverse, atSource) {
		if (reverse) {
			return atSource ? targetTipSymbolShapeId : sourceTipSymbolShapeId;
		}

		return atSource ? sourceTipSymbolShapeId : targetTipSymbolShapeId;
	}
</script>

<g
	class={{ 'edge-container': true, active: isActive.value, 'selection-handles': selectionHandles }}
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
		evt.preventDefault();
		reversePreview = evt.shiftKey;
		evt.currentTarget.focus({
			preventScroll: true
		});
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

		reversePreview = evt.shiftKey;
		const worldPos = clientToCanvas(evt.clientX, evt.clientY);
		draftTargetPosition.value = worldPos;
		cameraTow.value = worldPos;

		const closeTargets = R.reject(R.isNil)(
			R.map((node) => {
				if (
					!R.equals(node.id, draftSourceId.value) &&
					validEdge(draftSourceId.value, node.id) &&
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
		reversePreview = evt.shiftKey;
		cameraTow.value = undefined;

		if (validConnection.value && newEdge) {
			newEdge(connection.value, evt);
		} else if (newEdgeNode) {
			const dist = Math.hypot(
				draftSourcePosition.value.x - draftTargetPosition.value.x,
				draftSourcePosition.value.y - draftTargetPosition.value.y
			);

			if (dist > snapRadiusScaled.value * 2) {
				newEdgeNode(
					{
						source: draftSourceId.value,
						newTarget: draftTargetPosition.value
					},
					evt
				);
			}
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
		class={{ 'edge-surface': true, active: isActive.value || preventNextClick }}
	/>

	<g transform={rotationTransform.value} pointer-events="none">
		{#each sockets.value as v, i (i)}
			{#if socketVisible(v) && (!draftSourceId.value || validEdge(draftSourceId.value, v.id))}
				<circle
					data-idx={JSON.stringify(v.id)}
					cx={v.x}
					cy={v.y}
					pointer-events="all"
					r={socketHitRadius()}
					class={{
						'socket-outer': true,
						'active-source': draftSourceId.value === v.id,
						'active-target': draftTargetId.value === v.id
					}}
				></circle>
				<circle
					data-idx={JSON.stringify(v.id)}
					class={{
						'socket-center': true,
						'active-source': draftSourceId.value === v.id,
						'active-target': draftTargetId.value === v.id
					}}
					cx={v.x}
					cy={v.y}
					r={socketCenterRadius()}
				></circle>
			{/if}
		{/each}

		{#if draftEdgeSourcePosition.value && draftEdgeTargetPosition.value}
			<path
				class={{ edge: true, valid: validConnection.value }}
				stroke="black"
				pointer-events="none"
				d="M{draftEdgeSourcePosition.value.x} {draftEdgeSourcePosition.value
					.y} L {draftEdgeTargetPosition.value.x} {draftEdgeTargetPosition.value.y}"
			/>
			{@const previewSourceTipSymbolId = previewTipSymbolId(reversePreview, true)}
			{@const previewTargetTipSymbolId = previewTipSymbolId(reversePreview, false)}
			{#if symbols && (previewSourceTipSymbolId || previewTargetTipSymbolId)}
				{#if previewSourceTipSymbolId}
					{@const sourceArrowPoint = edgeArrowPoint(
						draftEdgeSourcePosition.value,
						draftEdgeTargetPosition.value,
						true
					)}
					<g
						class="edge-arrow-symbol"
						pointer-events="none"
						transform="rotate({edgeArrowAngle(
							draftEdgeSourcePosition.value,
							draftEdgeTargetPosition.value,
							true
						)} {sourceArrowPoint.x} {sourceArrowPoint.y})"
					>
						<Symbol
							{symbols}
							symbolId={previewSourceTipSymbolId}
							box={edgeArrowBox(draftEdgeSourcePosition.value, draftEdgeTargetPosition.value, true)}
						/>
					</g>
				{/if}
				{#if previewTargetTipSymbolId}
					{@const targetArrowPoint = edgeArrowPoint(
						draftEdgeSourcePosition.value,
						draftEdgeTargetPosition.value,
						false
					)}
					<g
						class="edge-arrow-symbol"
						pointer-events="none"
						transform="rotate({edgeArrowAngle(
							draftEdgeSourcePosition.value,
							draftEdgeTargetPosition.value,
							false
						)} {targetArrowPoint.x} {targetArrowPoint.y})"
					>
						<Symbol
							{symbols}
							symbolId={previewTargetTipSymbolId}
							box={edgeArrowBox(
								draftEdgeSourcePosition.value,
								draftEdgeTargetPosition.value,
								false
							)}
						/>
					</g>
				{/if}
			{:else}
				<path
					class={{ 'edge-arrow': true, valid: validConnection.value }}
					pointer-events="none"
					d={edgeArrowHeadPath(
						draftEdgeSourcePosition.value,
						draftEdgeTargetPosition.value,
						reversePreview
					)}
				/>
			{/if}
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
		cursor: default;
		display: initial;
	}

	.edge-container.active {
		cursor: default;
	}

	.socket-outer {
		pointer-events: all;
		fill: none;
		stroke: none;
		cursor: default;
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

	.selection-handles .socket-center {
		stroke: var(--selection-color, #7af);
	}

	.selection-handles .socket-center.active-source,
	.selection-handles .socket-center.active-target {
		fill: var(--selection-color, #7af);
		stroke: white;
	}

	.edge {
		stroke-width: 1;
		stroke: black;
		stroke-linecap: butt;
		stroke-opacity: 1;
		pointer-events: none;
	}

	.edge.valid {
		stroke: black;
		stroke-width: 1px;
		stroke-opacity: 1;
	}

	.edge-arrow {
		fill: black;
		stroke: black;
		stroke-width: 1;
		stroke-linejoin: miter;
		fill-opacity: 1;
		pointer-events: none;
	}

	.edge-arrow.valid {
		fill: black;
		stroke: black;
		fill-opacity: 1;
	}

	.edge-arrow-symbol {
		pointer-events: none;
	}

	.edge-arrow-symbol :global(path) {
		fill: black;
		stroke: black;
	}
</style>
