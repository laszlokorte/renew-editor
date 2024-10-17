<script>
	import { tick, untrack } from 'svelte';

	import * as L from 'partial.lenses';
	import { atom, view, during, read } from '../../svatom.svelte.js';
	import { bindEvents } from './events';
	import { constructLenses } from './live';
	import { frameBoxLens } from './lenses';

	const { camera, frameBoxPath, children, errorHandler } = $props();

	const svgElement = atom(null);
	const thisElement = view(
		L.setter((g) => g.ownerSVGElement),
		svgElement
	);

	const liveLenses = constructLenses(svgElement, camera);
	const frameBoxObject = read(frameBoxLens, camera);

	const cameraFocus = view('focus', camera);
</script>

<g
	bind:this={thisElement.value}
	use:bindEvents={{ camera, worldClientIso: liveLenses.worldClientIso, errorHandler }}
>
	<path d={frameBoxPath.value} stroke="none" fill="#ffffff00" pointer-events="all" />

	{@render children()}
</g>
