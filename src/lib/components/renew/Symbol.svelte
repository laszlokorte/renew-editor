<script>
	import { buildPath } from './symbols';
	const { symbols, symbolId, box, background_url } = $props();

	let error = $state(false);
</script>

{#await symbols}
	<rect x={box.x} y={box.y} width={box.width} height={box.height}></rect>
{:then symbols}
	{@const symbol = symbols.get(symbolId)}
	{#if symbol}
		{#each symbol.paths as path, i (i)}
			<path
				fill={path.fill_color ?? 'transparent'}
				stroke={path.stroke_color ?? 'transparent'}
				d={buildPath(box, path)}
				fill-rule="evenodd"
			/>
		{/each}
	{:else if background_url}
		<image
			x={box.x}
			y={box.y}
			width={box.width}
			height={box.height}
			xlink:href={background_url}
			onerror={() => {
				error = true;
			}}
		/>
		{#if error}
			<rect
				x={box.x}
				y={box.y}
				width={box.width}
				height={box.height}
				fill="none"
				stroke="#a00"
				stroke-width="2"
			></rect>
			<text x={box.x + box.width / 2} y={box.y + box.height / 2} fill="#a00" text-anchor="middle"
				><tspan x={box.x + box.width / 2}>Image not available</tspan>
				<tspan font-size="0.5em" x={box.x + box.width / 2} dy="2em">{background_url}</tspan>
			</text>
		{/if}
	{:else}
		<rect x={box.x} y={box.y} width={box.width} height={box.height}></rect>
	{/if}
{/await}

<style>
	rect,
	text,
	path {
		outline: none;
	}
</style>
