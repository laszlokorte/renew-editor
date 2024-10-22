<script>
	import * as L from 'partial.lenses';
	import * as F from '$lib/svg/formatter.js';
	import * as Geo from '$lib/math/geometry';
	import { view, combine, atom } from '$lib/reactivity/atom.svelte.js';

	const { rotationTransform, frameBoxObject, cameraScale, gridDistance = atom(128) } = $props();

	const gridBuilder =
		(offset) =>
		({ cellSize, rect, scale, screen: { minX, minY, width, height } }) => {
			if (cellSize < 5) {
				return '';
			}

			const size = Math.hypot(width, height);

			const logRoundedScale = Math.pow(2, Math.round(Math.log(scale) / Math.log(2) - offset));

			const camCenterX = (rect.a.x + rect.c.x) / 2;
			const camCenterY = (rect.a.y + rect.d.y) / 2;
			const scaledDistance = cellSize * logRoundedScale;

			const range = Math.floor(size / scaledDistance);
			const baseDistanceX = Math.floor(camCenterX / scaledDistance) * scaledDistance;
			const baseDistanceY = Math.floor(camCenterY / scaledDistance) * scaledDistance;

			let path = '';

			for (let i = -range; i < range; i++) {
				{
					const dist = -baseDistanceY + i * scaledDistance;
					const raySegment = Geo.rayInsideQuad(Math.PI, dist, rect);

					if (raySegment) {
						path += F.formattedNumbers`M${raySegment.a.x},${raySegment.a.y}L${raySegment.b.x},${raySegment.b.y}`;
					}
				}
				{
					const dist = -baseDistanceX + i * scaledDistance;
					const raySegment = Geo.rayInsideQuad(Math.PI / 2, dist, rect);

					if (raySegment) {
						path += F.formattedNumbers`M${raySegment.a.x},${raySegment.a.y}L${raySegment.b.x},${raySegment.b.y}`;
					}
				}
			}

			return path;
		};

	const gridPathGeneral = view(
		[
			L.pick({
				rect: ['frameBoxObject', 'worldSpace'],
				screen: ['frameBoxObject', 'screenSpaceAligned'],
				scale: 'cameraScale',
				cellSize: 'gridDistance'
			})
		],
		combine({ gridDistance, frameBoxObject, cameraScale })
	);

	const gridPathPrimary = view(L.reread(gridBuilder(0)), gridPathGeneral);
	const gridPathSecondary = view(L.reread(gridBuilder(1)), gridPathGeneral);
</script>

<g transform={rotationTransform.value} pointer-events="none">
	<path
		class="grid-lines-secondary"
		d={gridPathSecondary.value}
		stroke="#eee"
		stroke-width="1px"
		fill="none"
		vector-effect="non-scaling-stroke"
		shape-rendering="optimizeSpeed"
	/>
	<path
		class="grid-lines-primary"
		d={gridPathPrimary.value}
		stroke="#eee"
		stroke-width="1px"
		fill="none"
		vector-effect="non-scaling-stroke"
		shape-rendering="optimizeSpeed"
	/>
</g>

<style>
	.grid-lines-secondary {
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
		shape-rendering: optimizeSpeed;
		stroke: #f0f0f0;
		fill: none;
	}
	.grid-lines-primary {
		stroke-width: 1px;
		vector-effect: non-scaling-stroke;
		shape-rendering: optimizeSpeed;
		stroke: #e0f5ff;
		fill: none;
	}
</style>
