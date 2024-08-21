<script>
	const {scrollPosition} = $props()
</script>

<svg class="canvas" viewBox="-500 -500 1000 1000">

<circle cx="{-scrollPosition.value.x}" cy="{-scrollPosition.value.y}" r="100" fill="royalblue" />
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

	circle:hover {
		transform: scale(1.1);
	}
</style>