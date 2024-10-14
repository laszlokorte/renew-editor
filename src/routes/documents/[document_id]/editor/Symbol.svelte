<script>
	import { buildPath } from './symbols';
	const { symbols, symbolId, box } = $props();
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
	{:else}
		<rect x={box.x} y={box.y} width={box.width} height={box.height}></rect>
	{/if}
{/await}
