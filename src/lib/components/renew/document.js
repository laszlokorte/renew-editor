import * as L from 'partial.lenses';
import * as R from 'ramda';

function isFiniteRect(rect) {
	return (
		rect &&
		Number.isFinite(rect.x) &&
		Number.isFinite(rect.y) &&
		Number.isFinite(rect.width) &&
		Number.isFinite(rect.height)
	);
}

function isFiniteBounds(bounds) {
	return (
		bounds &&
		Number.isFinite(bounds.minX) &&
		Number.isFinite(bounds.minY) &&
		Number.isFinite(bounds.maxX) &&
		Number.isFinite(bounds.maxY)
	);
}

function unionBounds(bounds, next) {
	if (!isFiniteBounds(next)) {
		return bounds;
	}

	if (!isFiniteBounds(bounds)) {
		return next;
	}

	return {
		minX: Math.min(bounds.minX, next.minX),
		minY: Math.min(bounds.minY, next.minY),
		maxX: Math.max(bounds.maxX, next.maxX),
		maxY: Math.max(bounds.maxY, next.maxY)
	};
}

function boundsFromRect(rect) {
	if (!isFiniteRect(rect)) {
		return undefined;
	}

	return {
		minX: rect.x,
		minY: rect.y,
		maxX: rect.x + rect.width,
		maxY: rect.y + rect.height
	};
}

function boundsFromPoints(points) {
	return points
		.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))
		.reduce(
			(bounds, { x, y }) =>
				unionBounds(bounds, {
					minX: x,
					minY: y,
					maxX: x,
					maxY: y
				}),
			undefined
		);
}

function layerVisualBounds(layer, textBounds) {
	if (layer.text) {
		const measuredBounds = boundsFromRect(textBounds?.[layer.id]);
		if (measuredBounds) {
			return measuredBounds;
		}

		return boundsFromPoints([{ x: layer.text.position_x, y: layer.text.position_y }]);
	}

	if (layer.box) {
		return boundsFromRect({
			x: layer.box.position_x,
			y: layer.box.position_y,
			width: layer.box.width,
			height: layer.box.height
		});
	}

	if (layer.edge) {
		return boundsFromPoints([
			{ x: layer.edge.source_x, y: layer.edge.source_y },
			...(layer.edge.waypoints ?? []),
			{ x: layer.edge.target_x, y: layer.edge.target_y }
		]);
	}

	return undefined;
}

/**
 * Computes the visible canvas around actual layer geometry.
 *
 * Server-side viewboxes have already been padded, but text is only represented
 * there by its anchor point. Unioning a measured text box with that pre-padded
 * viewbox gives text a different margin on different sides. Instead, measure
 * all content without padding and apply one uniform margin at the end.
 */
export function calculateCanvasViewbox(doc, textBounds = {}, padding = 100) {
	const layers = doc?.layers?.items;
	if (!layers) {
		return doc?.viewbox;
	}

	const bounds = layers.reduce(
		(acc, layer) => unionBounds(acc, layerVisualBounds(layer, textBounds)),
		undefined
	);

	if (!isFiniteBounds(bounds)) {
		return {
			x: -padding,
			y: -padding,
			width: 2 * padding,
			height: 2 * padding
		};
	}

	return {
		x: bounds.minX - padding,
		y: bounds.minY - padding,
		width: bounds.maxX - bounds.minX + 2 * padding,
		height: bounds.maxY - bounds.minY + 2 * padding
	};
}

function walkLayer(doc, parent, parents, hidden) {
	return doc.layers.items
		.map((l, index) => ({ l, index }))
		.filter(({ l }) => l.parent_id === parent)
		.flatMap(({ l, index }) => {
			const children = walkLayer(doc, l.id, [l.id, ...parents], l.hidden || hidden).map(
				(x, i, a) => ({
					...x,
					isLast: i + 1 === a.length
				})
			);

			const own_bounding = L.get(
				[
					L.cond(
						[
							R.prop('box'),
							[
								'box',
								L.pick({
									minX: 'position_x',
									minY: 'position_y',
									maxX: [L.props('position_x', 'width'), L.foldTraversalLens(L.sum, L.values)],
									maxY: [L.props('position_y', 'height'), L.foldTraversalLens(L.sum, L.values)]
								})
							]
						],
						[
							R.prop('text'),
							[
								'text',
								L.pick({
									minX: 'position_x',
									minY: 'position_y',
									maxX: 'position_x',
									maxY: 'position_y'
								})
							]
						],
						[
							R.prop('edge'),
							[
								'edge',
								L.pick({
									minX: L.foldTraversalLens(
										L.minimum,
										L.branch({
											source_x: L.identity,
											target_x: L.identity,
											waypoints: [L.elems, 'x']
										})
									),
									minY: L.foldTraversalLens(
										L.minimum,
										L.branch({
											source_y: L.identity,
											target_y: L.identity,
											waypoints: [L.elems, 'y']
										})
									),
									maxX: L.foldTraversalLens(
										L.maximum,
										L.branch({
											source_x: L.identity,
											target_x: L.identity,
											waypoints: [L.elems, 'x']
										})
									),
									maxY: L.foldTraversalLens(
										L.maximum,
										L.branch({
											source_y: L.identity,
											target_y: L.identity,
											waypoints: [L.elems, 'y']
										})
									)
								})
							]
						],
						[
							L.reread(
								R.always({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
							)
						]
					)
				],
				l
			);

			const deep_bounding = children.reduce(
				(
					{ minX: AccminX, minY: AccminY, maxX: AccmaxX, maxY: AccmaxY },
					{ deep_bounding: { minX, minY, maxX, maxY } }
				) => ({
					minX: Math.min(minX, AccminX),
					minY: Math.min(minY, AccminY),
					maxX: Math.max(maxX, AccmaxX),
					maxY: Math.max(maxY, AccmaxY)
				}),
				own_bounding
			);

			return [
				{
					id: l.id,
					index,
					depth: parents.length,
					parents,
					hidden: l.hidden || hidden,
					has_children: children.length > 0,
					own_bounding,
					deep_bounding
				},
				...children
			];
		});
}

export function walkDocument(doc) {
	return [...walkLayer(doc, null, [], false)];
}
