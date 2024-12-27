<script>
	import * as L from 'partial.lenses';
	import { view, atom, update, combine, read } from '$lib/reactivity/atom.svelte';
	import { numberSvgFormat } from '$lib/svg/formatter';

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
		contain: strict;

		user-select: none;
		-webkit-user-select: none;
		touch-action: none;

		-webkit-touch-callout: none;
		-webkit-user-callout: none;
		-webkit-user-select: none;
		-webkit-user-drag: none;
		-webkit-user-modify: none;
		-webkit-highlight: none;
	}

	.canvas:focus {
		outline: none;
	}

	.canvas :global(*):focus {
		outline: none;
	}
</style>
