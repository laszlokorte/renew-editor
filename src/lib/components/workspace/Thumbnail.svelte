<script>
	import * as L from 'partial.lenses';
	import Symbol from '$lib/components/renew/Symbol.svelte';
	import TextElement from '$lib/components/renew/TextElement.svelte';
	import { edgeAngle, edgePath, tipColor } from '$lib/components/renew/edges.js';
	import { atom, view } from '$lib/reactivity/atom.svelte';

	const textBounds = atom({});
	const { document, symbols } = $props();

	function symbolShapeAttributes(box) {
		return {
			...(box?.symbol_shape_attributes ?? {}),
			...(box?.shape_attributes ?? {})
		};
	}
</script>

<svg
	{...document.viewbox}
	overflow="visible"
	viewBox="{document.viewbox.x} {document.viewbox.y} {document.viewbox.width} {document.viewbox
		.height}"
>
	{#each document.layers.items as layer (layer.id)}
		{#if !layer.hidden}
			{#if layer.box}
				<g
					role="button"
					tabindex="-1"
					fill={layer.style?.background_color ?? '#70DB93'}
					stroke={layer.style?.border_color ?? 'black'}
					stroke-dasharray={layer.style?.border_dash_array ?? 'none'}
					stroke-width={layer.style?.border_width ?? '1'}
					opacity={layer.style?.opacity ?? '1'}
				>
					<Symbol
						{symbols}
						symbolId={layer.box.shape}
						shapeAttributes={symbolShapeAttributes(layer.box)}
						background_url={layer.style?.background_url}
						box={{
							x: layer.box.position_x,
							y: layer.box.position_y,
							width: layer.box.width,
							height: layer.box.height
						}}
					/>
				</g>
			{/if}
			{#if layer.text}
				{@const thisbbox = view(L.prop(layer.id), textBounds)}
				{#key layer.id}
					<g role="button" tabindex="-1">
						<TextElement bbox={thisbbox} el={layer} />
					</g>
				{/key}
			{/if}
			{#if layer.edge}
				<g
					role="button"
					tabindex="-1"
					opacity={layer.style?.opacity ?? '1'}
					stroke={layer.edge?.style?.stroke_color ?? 'black'}
					stroke-width={layer.edge?.style?.stroke_width ?? '1'}
					stroke-linejoin={layer.edge?.style?.stroke_join ?? 'miter'}
					stroke-linecap={layer.edge?.style?.stroke_cap ?? 'butt'}
				>
					<path
						d={edgePath[layer.edge?.style?.smoothness ?? 'linear'](
							layer.edge,
							L.get('waypoints', layer.edge)
						)}
						pointer-events="stroke"
						fill={layer.edge?.cyclic ? (layer.style?.background_color ?? 'none') : 'none'}
						stroke="none"
						stroke-width={(layer.edge?.style?.stroke_width ?? 1) * 1 + 10}
					/>
					<path
						d={edgePath[layer.edge?.style?.smoothness ?? 'linear'](
							layer.edge,
							L.get('waypoints', layer.edge)
						)}
						stroke-dasharray={layer.edge?.style?.stroke_dash_array ?? 'none'}
						fill="none"
					/>

					{#if layer.edge?.style?.source_tip_symbol_shape_id}
						{@const source_angle = edgeAngle['source'](layer.edge, L.get('waypoints', layer.edge))}
						{@const size = layer.edge?.style?.stroke_width ?? 1}

						<g
							fill={tipColor(
								layer.style?.background_color,
								layer.edge?.style?.stroke_color,
								'black'
							)}
							stroke={tipColor(
								layer.style?.background_color,
								layer.edge?.style?.stroke_color,
								'black'
							)}
							transform="rotate({source_angle} {layer.edge.source_x} {layer.edge.source_y})"
						>
							<Symbol
								{symbols}
								symbolId={layer.edge?.style?.source_tip_symbol_shape_id}
								box={{
									x: layer.edge.source_x - size,
									y: layer.edge.source_y - size,
									width: 2 * size,
									height: 2 * size
								}}
							/>
						</g>
					{/if}

					{#if layer.edge?.style?.target_tip_symbol_shape_id}
						{@const target_angle = edgeAngle['target'](layer.edge, L.get('waypoints', layer.edge))}
						{@const size = layer.edge?.style?.stroke_width ?? 1}
						<g
							fill={tipColor(
								layer.style?.background_color,
								layer.edge?.style?.stroke_color,
								'black'
							)}
							stroke={tipColor(
								layer.style?.background_color,
								layer.edge?.style?.stroke_color,
								'black'
							)}
							transform="rotate({target_angle} {layer.edge.target_x} {layer.edge.target_y})"
						>
							<Symbol
								{symbols}
								symbolId={layer.edge?.style?.target_tip_symbol_shape_id}
								box={{
									x: layer.edge.target_x - size,
									y: layer.edge.target_y - size,
									width: 2 * size,
									height: 2 * size
								}}
							/>
						</g>
					{/if}
				</g>
			{/if}
		{/if}
	{/each}
</svg>
