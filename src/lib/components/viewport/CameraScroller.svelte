<script>
	import { onMount, tick } from 'svelte';
	import * as L from 'partial.lenses';
	import * as R from 'ramda';
	import { view, atom, update, combine, read } from '$lib/reactivity/atom.svelte';
	import * as Geo from '$lib/math/geometry';

	import Scroller from '$lib/components/scroller/Scroller.svelte';

	const { camera, extension, children } = $props();

	// This is needed to prevent a ceil/floor feedback loop between integer scroll positions of scrollbars and camera position
	const integerLens = L.lens(
		(x) => Math.floor(x),
		(newV, oldV) => Math.ceil(newV) + (oldV - Math.floor(oldV))
	);

	const scrollWindowSize = view(
		[
			L.lens(R.prop('frame'), (newSize) => ({
				frame: newSize,
				plane: newSize
			}))
		],
		combine({
			plane: view(
				[
					'plane',
					L.ifElse(
						R.prop('autosize'),
						L.identity,
						L.lens(R.identity, (_, o) => o)
					),
					L.props('x', 'y')
				],
				camera
			),
			frame: view(['frame', 'size'], camera)
		})
	);

	const cameraX = view(['focus', 'x'], camera);
	const cameraY = view(['focus', 'y'], camera);

	const cameraScaleLens = L.reread((c) => Math.exp(-c.focus.z));
	const cameraScale = read(cameraScaleLens, camera);

	function rotatedBounds(degree, rect) {
		const rectCenterX = (rect.maxX + rect.minX) / 2;
		const rectCenterY = (rect.maxY + rect.minY) / 2;
		const halfWidth = (rect.maxX - rect.minX) / 2;
		const halfHeight = (rect.maxY - rect.minY) / 2;

		const c1 = Geo.rotateDegree(degree, { x: halfWidth, y: halfHeight });
		const c2 = Geo.rotateDegree(degree, { x: -halfWidth, y: halfHeight });
		const c3 = Geo.rotateDegree(degree, { x: halfWidth, y: -halfHeight });
		const c4 = Geo.rotateDegree(degree, { x: -halfWidth, y: -halfHeight });

		const halfWidthRot = Math.max(Math.abs(c1.x), Math.abs(c2.x), Math.abs(c3.x), Math.abs(c4.x));
		const halfHeightRot = Math.max(Math.abs(c1.y), Math.abs(c2.y), Math.abs(c3.y), Math.abs(c4.y));

		return {
			angle: degree,
			minX: rectCenterX - halfWidthRot,
			maxX: rectCenterX + halfWidthRot,
			minY: rectCenterY - halfHeightRot,
			maxY: rectCenterY + halfHeightRot
		};
	}

	function rotatedClamp(rect, pos, padding) {
		const rectCenterX = (rect.maxX + rect.minX) / 2;
		const rectCenterY = (rect.maxY + rect.minY) / 2;
		const halfWidthRot = (rect.maxX - rect.minX) / 2 + padding;
		const halfHeightRot = (rect.maxY - rect.minY) / 2 + padding;

		const posRelX = pos.x - rectCenterX;
		const posRelY = pos.y - rectCenterY;

		const posRot = Geo.rotateDegree(-rect.angle, {
			x: posRelX,
			y: posRelY
		});
		const posRotClampedX = R.clamp(-halfWidthRot, +halfWidthRot, posRot.x);
		const posRotClampedY = R.clamp(-halfHeightRot, +halfHeightRot, posRot.y);

		const posClamped = Geo.rotateDegree(rect.angle, {
			x: posRotClampedX,
			y: posRotClampedY
		});

		return {
			x: rectCenterX + posClamped.x,
			y: rectCenterY + posClamped.y
		};
	}

	const cameraBounds = read(
		({ c, e }) => {
			return rotatedBounds(c.focus.w, e);
		},
		combine({ c: camera, e: extension })
	);

	const cameraInBounds = view(
		L.lens(
			({ x, y, s, w, b }) => {
				const rot = Geo.rotatePivotXYDegree((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, b.angle, {
					x,
					y
				});

				return {
					x: (rot.x - b.minX) / s - w.x / 2,
					y: (rot.y - b.minY) / s - w.y / 2
				};
			},
			({ x, y }, { s, w, b }) => {
				const rot = Geo.rotatePivotXYDegree(
					(b.minX + b.maxX) / 2,
					(b.minY + b.maxY) / 2,
					-b.angle,
					{
						x: (x + w.x / 2) * s + b.minX,
						y: (y + w.y / 2) * s + b.minY
					}
				);

				return {
					x: rot.x,
					y: rot.y
				};
			}
		),
		combine(
			{
				x: cameraX,
				y: cameraY,
				s: cameraScale,
				w: scrollWindowSize,
				b: cameraBounds
			},
			{ x: true, y: true }
		)
	);

	const scrollPosition = view(
		[
			L.pick({ x: ['x', integerLens], y: ['y', integerLens] }),
			L.setter((newScroll, old) => ({
				x:
					(newScroll.atMinX && old.x < newScroll.x) || (newScroll.atMaxX && old.x > newScroll.x)
						? old.x
						: newScroll.x,
				y:
					(newScroll.atMinY && old.y < newScroll.y) || (newScroll.atMaxY && old.y > newScroll.y)
						? old.y
						: newScroll.y
			}))
		],
		cameraInBounds
	);

	const scrollContentSize = view(
		({ s, w, b }) => ({
			x: (b.maxX - b.minX) / s,
			y: (b.maxY - b.minY) / s
		}),
		combine({
			s: cameraScale,
			b: cameraBounds
		})
	);

	export function resetCamera() {
		const plane = camera.value.plane;
		const bounds = cameraBounds.value;
		update(
			L.set(['focus', L.props('z', 'x', 'y', 'w')], {
				x: (bounds.maxX + bounds.minX) / 2,
				y: (bounds.maxY + bounds.minY) / 2,
				z: -Math.max(
					Math.log(bounds.maxX - bounds.minX) - (plane.x ? Math.log(plane.x) : 0),
					Math.log(bounds.maxY - bounds.minY) - (plane.y ? Math.log(plane.y) : 0)
				),
				w: bounds.angle
			}),
			camera
		);
	}

	const cameraAutoPadding = view(['frame', 'autoPadding'], camera);
</script>

<Scroller
	allowOverscroll={atom(false)}
	center={atom(false)}
	extraScrollPadding={cameraAutoPadding}
	{scrollPosition}
	contentSize={scrollContentSize}
	{scrollWindowSize}
>
	{@render children()}
</Scroller>
