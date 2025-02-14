<script>
	import * as L from 'partial.lenses';
	import { view, atom, update, combine, read } from '$lib/reactivity/atom.svelte';
	import { numberSvgFormat } from '$lib/svg/formatter';
	import { stopPropagation } from 'svelte/legacy';
	import PreventSafariMagnifier from './PreventSafariMagnifier.svelte';

	const { camera, children, onclick, onkeydown, onpointermove, ondblclick } = $props();

	let svgElement = atom(undefined);
	let svgPoint = read(
		L.reread((e) => e.createSVGPoint()),
		svgElement
	);

	const viewBoxLens = L.reread((cam) => {
		return `${numberSvgFormat.format(cam.focus.x - (cam.plane.x / 2) * Math.exp(-cam.focus.z))} 
		${numberSvgFormat.format(cam.focus.y - (cam.plane.y / 2) * Math.exp(-cam.focus.z))} 
		${numberSvgFormat.format(cam.plane.x * Math.exp(-cam.focus.z))} 
		${numberSvgFormat.format(cam.plane.y * Math.exp(-cam.focus.z))}`;
	});
	const viewBox = view(viewBoxLens, camera);
</script>

<svg
	bind:this={svgElement.value}
	class="canvas"
	role="button"
	tabindex="-1"
	preserveAspectRatio="xMidYMin slice"
	{onclick}
	{ondblclick}
	{onkeydown}
	{onpointermove}
	viewBox={viewBox.value}
>
	{#if children}
		{@render children()}
	{/if}

	<PreventSafariMagnifier />
</svg>

<style>
	.canvas {
		background: #ddeeee;
		flex-grow: 1;
		flex-shrink: 1;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		touch-action: none;

		user-select: none;
		-webkit-user-select: none;
		touch-action: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
		display: block;
	}

	.canvas :global(*) {
		user-select: none !important;
		-webkit-touch-callout: none !important;
		-webkit-user-callout: none !important;
		-webkit-user-select: none !important;
		-webkit-user-drag: none !important;
		-webkit-user-modify: none !important;
		-webkit-highlight: none !important;
		display: block;
		touch-action: none;
	}

	.canvas:focus {
		outline: none;
	}

	.canvas :global(*):focus {
		outline: none;
	}
</style>
