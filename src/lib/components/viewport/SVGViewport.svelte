<script>
	const {scrollPosition} = $props()
</script>

<svg class="canvas" viewBox="-500 -500 1000 1000">

<circle class="entity" cx="{-scrollPosition.value.x}" cy="{-scrollPosition.value.y}" r="100" fill="#24d188" stroke="black" stroke-width="3" />


<rect class="entity" x="{-scrollPosition.value.x-100}" y="{300-scrollPosition.value.y}" r="100" fill="#24d188" stroke="black" stroke-width="3" width="200" height="120" />
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

	.entity {
		transition: transform 0.2s ease;
		transform-box: fill-box;
		transform-origin: 50% 50%;
		cursor: pointer;
	}

	.entity:hover {
		transform: scale(1.1);
	}
</style>