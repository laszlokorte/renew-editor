<script>
	const { scrollPosition, children, onclick, onkeydown, onpointerpoistion } = $props();

	let svgElement = $state(null);
	let svgPoint = $derived(svgElement.createSVGPoint());
	let cusor = $state(null);

	let onpointermove = onpointerpoistion
		? (evt) => {
				if (evt.isPrimary) {
					svgPoint.x = evt.clientX;
					svgPoint.y = evt.clientY;

					// The cursor point, translated into svg coordinates
					const { x, y } = svgPoint.matrixTransform(svgElement.getScreenCTM().inverse());

					onpointerpoistion({ x, y });
					cusor = { x, y };
				}
			}
		: null;
</script>

<svg
	bind:this={svgElement}
	class="canvas"
	role="button"
	tabindex="-1"
	preserveAspectRatio="xMidYMin slice"
	{onclick}
	{onkeydown}
	{onpointermove}
	viewBox="{-500 + scrollPosition.value.x} {-500 + scrollPosition.value.y} 1000 1000"
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
	}
</style>
