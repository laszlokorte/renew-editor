<script>
	const { scrollPosition, children, onclick, onkeydown } = $props();
</script>

<svg
	class="canvas"
	role="button"
	tabindex="-1"
	preserveAspectRatio="xMidYMin slice"
	{onclick}
	{onkeydown}
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
