<script>
	import * as L from 'partial.lenses';
	import { atom, view, during, read } from '$lib/reactivity/atom.svelte.js';
	import { bindEvents } from './events';
	import { constructLenses } from './live_lenses';
	import { frameBoxLens } from './lenses';

	import { pivotZoomLens, pivotRotationLens, panScreenLens } from './lenses';

	const { camera, frameBoxPath, children, errorHandler, onworldcursor, onpointerout } = $props();

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
	const rotationDelta = view(['focus', pivotRotationLens], camera);
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
</script>

<g
	bind:this={thisElement.value}
	{onpointermove}
	{onpointerout}
	use:bindEvents={{ zoomDelta, rotationDelta, panScreenDelta, eventToWorld }}
>
	<path d={frameBoxPath.value} stroke="none" fill="#ffffff00" pointer-events="all" />

	{@render children()}
</g>
