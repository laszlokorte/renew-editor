<script>
	import * as L from 'partial.lenses';
	import { atom, view, read, update, viewCombined } from '$lib/reactivity/atom.svelte.js';
	import { bindEvents } from './events';
	import { constructLenses } from './live_lenses';
	import { frameBoxLens } from './lenses';

	import {
		pivotZoomLens,
		pivotRotationLens,
		panScreenLens,
		panMovementLens,
		rotateMovementLens
	} from './lenses';
	import { zoomWithPivot, zoomIntoFrame } from './navigation';

	const {
		camera,
		frameBoxPath,
		children,
		errorHandler,
		onworldcursor,
		onpointerout,
		lockRotation
	} = $props();

	const svgElement = atom(null);
	const thisElement = view(
		L.setter((g) => g.ownerSVGElement),
		svgElement
	);

	const liveLenses = constructLenses(svgElement, camera);
	const frameBoxObject = read(frameBoxLens, camera);

	const cameraFocus = view('focus', camera);

	const eventWorldLens = [
		L.props('clientX', 'clientY'),
		L.pick({ x: 'clientX', y: 'clientY' }),
		L.inverse(liveLenses.worldClientIso),
		L.props('x', 'y')
	];

	const zoomDelta = view(['focus', pivotZoomLens], camera);
	const rotationDelta = viewCombined(
		L.choose(({ lockRotation }) =>
			lockRotation ? L.zero : ['camera', 'focus', pivotRotationLens]
		),
		{
			lockRotation,
			camera
		},
		{ camera: true }
	);
	const panScreenDelta = view(['focus', panScreenLens], camera);

	const eventToWorld = L.get(eventWorldLens);

	const onpointermove = $derived(
		onworldcursor
			? (evt) => {
					if (evt.isPrimary) {
						onworldcursor(eventToWorld(evt));
					}
				}
			: onworldcursor
	);

	const panMovement = view(panMovementLens, camera);
	const rotateMovement = view(rotateMovementLens, camera);

	const actions = {
		zoomDelta(delta) {
			update((f) => zoomWithPivot(delta, f), cameraFocus);
		},
		zoomFrame(frame) {
			update((c) => zoomIntoFrame(frame, c), camera);
		},
		panMove(delta) {
			panMovement.value = delta;
		},
		rotate(rot) {
			if (!lockRotation.value) {
				rotateMovement.value = rot;
			}
		}
	};
</script>

<g
	bind:this={thisElement.value}
	{onpointermove}
	{onpointerout}
	use:bindEvents={{ zoomDelta, rotationDelta, panScreenDelta, eventToWorld }}
>
	<path d={frameBoxPath.value} stroke="none" fill="#ffffff00" pointer-events="all" />

	{@render children(liveLenses, actions)}
</g>
