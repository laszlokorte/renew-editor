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
		loop = false,
		connectionLayout = 'line',
		createNodeOnEmpty = true,
		sourceLayerIds = undefined,
		selectionHandles = false,
		onCancelToSelect = undefined
	} = $props();

	const snapRadius = 20;
	const selectionHandleHitRadius = 4;
	const selectionHandleCenterRadius = 3;
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
	const draftSourcePointerPosition = view([L.removable('source'), 'position'], draft);
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
		L.reread(({ source, pointer }) => (!selectionHandles && pointer ? pointer : source)),
		combine({
			source: draftSourcePosition,
			pointer: draftSourcePointerPosition,
			target: draftTargetSnappedPosition
		})
	);
	const draftEdgeTargetPosition = view(
		L.reread(({ target }) => target),
		combine({
			source: draftSourcePosition,
			target: draftTargetSnappedPosition
		})
	);

	export const canCancel = read(R.identity, isActive);

	export function cancel() {
		isActive.value = false;
		pointerStart = undefined;
		cameraTow.value = undefined;
	}

	let preventNextClick = $state(false);
	let reversePreview = $state(false);
	let pointerStart = $state(undefined);
	const defaultTipSize = 1;

	function isCenterSocket(socket, centerX, centerY) {
		return Math.abs(socket.x - centerX) < 0.001 && Math.abs(socket.y - centerY) < 0.001;
	}

	function edgeArrowPoint(source, target, reverse = false) {
		return reverse ? source : target;
	}

	function edgeArrowAngle(source, target, reverse = false) {
		if (!source || !target) {
			return 0;
		}

		const points = previewPoints(source, target);
		const from = reverse ? points[1] : points[points.length - 2];
		const to = reverse ? points[0] : points[points.length - 1];

		return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
	}

	function edgeArrowBox(source, target, reverse = false) {
		const point = edgeArrowPoint(source, target, reverse);
		const size = defaultTipSize;

		return {
			x: point.x - size,
			y: point.y - size,
			width: 2 * size,
			height: 2 * size
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

		const points = previewPoints(source, target);
		const from = reverse ? points[1] : points[points.length - 2];
		const to = reverse ? points[0] : points[points.length - 1];
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len = Math.hypot(dx, dy);

		if (!len) {
			return '';
		}

		const arrowAngle = 0.4;
		const arrowOuterRadius = 2 * defaultTipSize;
		const arrowInnerRadius = 2 * defaultTipSize;
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

	function elbowWaypoints(source, target) {
		if (!source || !target) {
			return [];
		}

		const dx = target.x - source.x;
		const dy = target.y - source.y;

		if (Math.abs(dx) < 0.001 || Math.abs(dy) < 0.001) {
			return [];
		}

		if (Math.abs(dx) >= Math.abs(dy)) {
			const midX = source.x + dx / 2;
			return [
				{ x: midX, y: source.y },
				{ x: midX, y: target.y }
			];
		}

		const midY = source.y + dy / 2;
		return [
			{ x: source.x, y: midY },
			{ x: target.x, y: midY }
		];
	}

	function connectionWaypoints(source, target) {
		return connectionLayout === 'elbow' ? elbowWaypoints(source, target) : [];
	}

	function previewPoints(source, target) {
		if (!source || !target) {
			return [];
		}

		return [source, ...connectionWaypoints(source, target), target];
	}

	function previewPath(source, target) {
		const points = previewPoints(source, target);
		if (points.length === 0) {
			return '';
		}

		return points
			.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
			.join(' ');
	}

	function socketVisible(socket) {
		if (selectionHandles && sourceLayerIds) {
			return sourceLayerIds.includes(socket?.id?.layer);
		}

		if (isActive.value || !sourceLayerIds) {
			return true;
		}

		return sourceLayerIds.includes(socket?.id?.layer);
	}

	function socketIsSelectionHandle(socket) {
		if (!selectionHandles) {
			return true;
		}

		const box = socket?.box;
		if (!box) {
			return true;
		}

		return isCenterSocket(socket, box.x + box.width / 2, box.y + box.height / 2);
	}

	function socketBoxContainsPoint(socket, point) {
		const box = socket?.box;

		if (!box || !point) {
			return false;
		}

		return (
			point.x >= box.x &&
			point.x <= box.x + box.width &&
			point.y >= box.y &&
			point.y <= box.y + box.height
		);
	}

	function socketHandleContainsPoint(socket, point) {
		if (!socket || !point) {
			return false;
		}

		return Math.hypot(socket.x - point.x, socket.y - point.y) <= socketHitRadius();
	}

	function socketContainsPoint(socket, point) {
		return selectionHandles
			? socketHandleContainsPoint(socket, point)
			: socketBoxContainsPoint(socket, point);
	}

	function socketTargetContainsPoint(socket, point) {
		return selectionHandles
			? socketBoxContainsPoint(socket, point) || socketHandleContainsPoint(socket, point)
			: socketBoxContainsPoint(socket, point);
	}

	function socketAtPosition(position) {
		const candidates = [];

		for (const socket of [...(sockets.value ?? [])].reverse()) {
			if (
				!socketVisible(socket) ||
				!socketIsSelectionHandle(socket) ||
				!socketContainsPoint(socket, position)
			) {
				continue;
			}

			candidates.push({
				socket,
				distance: Math.hypot(socket.x - position.x, socket.y - position.y)
			});
		}

		return candidates.sort((a, b) => a.distance - b.distance)[0]?.socket.id ?? null;
	}

	function sourceIdFromEvent(evt) {
		const encodedId = evt.target.getAttribute('data-idx');

		if (encodedId) {
			return JSON.parse(encodedId);
		}

		return socketAtPosition(clientToCanvas(evt.clientX, evt.clientY));
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

	function isClickGesture(evt) {
		return pointerStart
			? Math.hypot(evt.clientX - pointerStart.x, evt.clientY - pointerStart.y) <= 6
			: false;
	}

	function finishGesture() {
		preventNextClick = true;
		pointerStart = undefined;
		isActive.value = false;
		onCancelToSelect?.();
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
		evt.stopPropagation();
		isActive.value = false;
		pointerStart = undefined;
		onCancelToSelect?.();
	}}
	onkeydown={(evt) => {
		if (!isActive.value) {
			return;
		}
		evt.preventDefault();
		if (evt.key === 'Escape' || evt.key === 'Esc') {
			isActive.value = false;
			onCancelToSelect?.();
		}
		if (evt.key === 'Tab') {
			draftTargetSnapCycle.value += 1;
		}
	}}
	onpointerdown={(evt) => {
		if (!evt.isPrimary || !E.isLeftButton(evt)) {
			isActive.value = false;
			pointerStart = undefined;
			onCancelToSelect?.();

			return;
		}
		evt.preventDefault();
		reversePreview = evt.shiftKey;
		pointerStart = { x: evt.clientX, y: evt.clientY };
		evt.currentTarget.focus({
			preventScroll: true
		});
		const nodeId = sourceIdFromEvent(evt);
		evt.currentTarget.setPointerCapture(evt.pointerId);
		if (nodeId !== null) {
			draftSourceId.value = nodeId;
			draftSourcePointerPosition.value = clientToCanvas(evt.clientX, evt.clientY);
			if (loop) {
				draftTargetIds.value = [nodeId];
			}
			draftTargetPosition.value = clientToCanvas(evt.clientX, evt.clientY);
		} else {
			pointerStart = undefined;
		}
	}}
	onpointermove={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		if (!isActive.value) {
			pointerStart = undefined;
			return;
		}

		reversePreview = evt.shiftKey;
		const worldPos = clientToCanvas(evt.clientX, evt.clientY);
		draftTargetPosition.value = worldPos;
		cameraTow.value = worldPos;

		if (loop) {
			draftTargetIds.value = draftSourceId.value ? [draftSourceId.value] : undefined;
			return;
		}

		const closeTargets = [...(sockets.value ?? [])]
			.filter((node) => {
				const distance = Math.hypot(node.x - worldPos.x, node.y - worldPos.y);

				return (
					!R.equals(node.id, draftSourceId.value) &&
					validEdge(draftSourceId.value, node.id) &&
					(socketTargetContainsPoint(node, worldPos) || distance < snapRadiusScaled.value)
				);
			})
			.sort(
				(a, b) =>
					Math.hypot(a.x - worldPos.x, a.y - worldPos.y) -
					Math.hypot(b.x - worldPos.x, b.y - worldPos.y)
			)
			.map((node) => node.id);

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

		if (loop) {
			const source = draftSourceId.value;

			if (source && validEdge(source, source) && newEdge) {
				newEdge(
					{
						source,
						target: source,
						loopPosition: draftTargetPosition.value,
						loopClick: isClickGesture(evt)
					},
					evt
				);
			}
		} else if (validConnection.value && newEdge) {
			newEdge(
				{
					...connection.value,
					waypoints: connectionWaypoints(
						draftEdgeSourcePosition.value,
						draftEdgeTargetPosition.value
					)
				},
				evt
			);
		} else if (createNodeOnEmpty && newEdgeNode) {
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

		finishGesture();
	}}
	onpointercancel={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
		pointerStart = undefined;
		onCancelToSelect?.();
		cameraTow.value = undefined;
	}}
	onlostpointercapture={(evt) => {
		if (!evt.isPrimary) {
			return;
		}
		isActive.value = false;
		onCancelToSelect?.();
		cameraTow.value = undefined;
	}}
>
	<path
		d={frameBoxPath.value}
		pointer-events={isActive.value || !selectionHandles ? 'all' : 'none'}
		fill="none"
		class={{
			'edge-surface': true,
			active: isActive.value || preventNextClick || !selectionHandles
		}}
	/>

	<g transform={rotationTransform.value} pointer-events="none">
		{#if selectionHandles}
			{#each sockets.value as v, i (i)}
				{#if socketVisible(v) && socketIsSelectionHandle(v) && (!draftSourceId.value || validEdge(draftSourceId.value, v.id))}
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
		{/if}

		{#if draftEdgeSourcePosition.value && draftEdgeTargetPosition.value}
			<path
				class={{ edge: true, valid: validConnection.value }}
				stroke="black"
				pointer-events="none"
				d={previewPath(draftEdgeSourcePosition.value, draftEdgeTargetPosition.value)}
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
