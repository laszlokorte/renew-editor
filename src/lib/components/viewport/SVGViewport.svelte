<script>
	const { scrollPosition, children } = $props();
</script>

<svg
	class="canvas"
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
