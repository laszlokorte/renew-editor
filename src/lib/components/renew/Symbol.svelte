<script>
	import { buildPath, buildPiePath } from './symbols';
	const { symbols, symbolId, box, shapeAttributes = null, background_url = null } = $props();

	let error = $state(false);

	function hasFaStartDecoration(decoration) {
		return decoration === 'start' || decoration === 'start_end';
	}

	function hasFaEndDecoration(decoration) {
		return decoration === 'end' || decoration === 'start_end';
	}

	function faStartDecoration(box) {
		const tip = {
			x: box.x + box.width * 0.1464466,
			y: box.y + box.height * 0.1464466
		};
		const tailLength = Math.max(10, Math.min(16, Math.min(box.width, box.height) * 0.3));
		const headSize = Math.max(4, Math.min(7, Math.min(box.width, box.height) * 0.16));
		const tail = {
			x: tip.x - tailLength,
			y: tip.y - tailLength
		};

		return {
			line: `${tail.x},${tail.y} ${tip.x},${tip.y}`,
			head: `${tip.x - headSize},${tip.y - headSize * 0.25} ${tip.x},${tip.y} ${tip.x - headSize * 0.25},${tip.y - headSize}`
		};
	}
</script>

{#await symbols}
	<rect x={box.x} y={box.y} width={box.width} height={box.height}></rect>
{:then symbols}
	{@const symbol = symbols.get(symbolId)}
	{#if symbol?.name === 'pie'}
		<path
			d={buildPiePath(box, shapeAttributes?.start_angle, shapeAttributes?.end_angle)}
			fill-rule="evenodd"
		/>
	{:else if symbol?.name === 'rect-round'}
		<rect
			x={box.x}
			y={box.y}
			width={box.width}
			height={box.height}
			rx={(shapeAttributes?.rx ?? 0) / 2}
			ry={(shapeAttributes?.ry ?? 0) / 2}
		/>
	{:else if symbol}
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
	{#if hasFaEndDecoration(shapeAttributes?.fa_decoration)}
		<ellipse
			cx={box.x + box.width / 2}
			cy={box.y + box.height / 2}
			rx={Math.max(box.width / 2 - 3, 0)}
			ry={Math.max(box.height / 2 - 3, 0)}
			fill="none"
			stroke="inherit"
			stroke-width="1"
		/>
	{/if}
	{#if hasFaStartDecoration(shapeAttributes?.fa_decoration)}
		{@const startDecoration = faStartDecoration(box)}
		<polyline
			points={startDecoration.line}
			fill="none"
			stroke="inherit"
			stroke-width="1"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
		<polyline
			points={startDecoration.head}
			fill="none"
			stroke="inherit"
			stroke-width="1"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
{/await}

<style>
	ellipse,
	rect,
	text,
	polyline,
	path {
		outline: none;
	}
</style>
