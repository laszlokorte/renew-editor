<script>
	import { atom } from '$lib/reactivity/atom.svelte.js';
	import { bindBoundingBox } from '$lib/reactivity/bindings.svelte.js';
	const { el, bbox = atom() } = $props();

	const alignment = {
		left: 'start',
		center: 'middle',
		right: 'end'
	};
	const alignmentWeight = {
		left: 0,
		center: 0.5,
		right: 1
	};
</script>

<g opacity={el?.style?.opacity ?? '1'}>
	{#if bbox.value}
		<rect
			fill={el?.style?.background_color ?? 'transparent'}
			stroke={el?.style?.border_color ?? 'transparent'}
			stroke-dasharray={el?.style?.border_dash_array ?? ''}
			stroke-width={el?.style?.border_width ?? '0'}
			x={bbox.value.x}
			y={bbox.value.y}
			width={bbox.value.width}
			height={bbox.value.height}
		/>
	{/if}
	<text
		fill={el.text?.style?.text_color ?? 'black'}
		x={el.text.position_x +
			alignmentWeight[el?.text?.style?.alignment ?? 'left'] * (bbox.value?.width ?? 0)}
		y={el.text.position_y}
		text-anchor={bbox.value ? alignment[el?.text?.style?.alignment ?? 'left'] : 'start'}
		font-size={el?.text?.style?.font_size ?? 12}
		font-family={el?.text?.style?.font_family ?? 'sans-serif'}
		font-weight={el?.text?.style?.bold ? 'bold' : 'normal'}
		font-style={el?.text?.style?.italic ? 'italic' : 'normal'}
		data-blank={el.text.style?.blank_lines ?? false}
		data-body={el.text.body}
	>
		{#each el.text.body.split('\n') as line, li (li)}
			{#if line.trim()}
				<tspan
					text-decoration={el?.text?.style?.underline ? 'underline' : 'none'}
					x={el.text.position_x +
						alignmentWeight[el?.text?.style?.alignment ?? 'left'] * (bbox.value?.width ?? 0)}
					dy={(li == 0 ? 1 : 1.2) * (el?.text?.style?.font_size ?? 12)}>{line.trim()}</tspan
				>
			{:else if el.text.style?.blank_lines ?? false}
				<tspan
					text-decoration="none"
					x={el.text.position_x +
						alignmentWeight[el?.text?.style?.alignment ?? 'left'] * (bbox.value?.width ?? 0)}
					dy={(li == 0 ? 1 : 1.2) * (el?.text?.style?.font_size ?? 12)}>&nbsp;</tspan
				>
			{/if}
		{/each}
	</text>


	<text
		use:bindBoundingBox={bbox}
		fill="transparent"
		stroke="transparent"
		x={el.text.position_x }
		y={el.text.position_y}
		text-anchor={'start'}
		font-size={el?.text?.style?.font_size ?? 12}
		font-family={el?.text?.style?.font_family ?? 'sans-serif'}
		font-weight={el?.text?.style?.bold ? 'bold' : 'normal'}
		font-style={el?.text?.style?.italic ? 'italic' : 'normal'}
		data-blank={el.text.style?.blank_lines ?? false}
		data-body={el.text.body}
	>
		{#each el.text.body.split('\n') as line, li (li)}
			{#if line.trim()}
				<tspan
					text-decoration={el?.text?.style?.underline ? 'underline' : 'none'}
					x={el.text.position_x}
					dy={(li == 0 ? 1 : 1.2) * (el?.text?.style?.font_size ?? 12)}>{line.trim()}</tspan
				>
			{:else if el.text.style?.blank_lines ?? false}
				<tspan
					text-decoration="none"
					x={el.text.position_x}
					dy={(li == 0 ? 1 : 1.2) * (el?.text?.style?.font_size ?? 12)}>&nbsp;</tspan
				>
			{/if}
		{/each}
	</text>
</g>
