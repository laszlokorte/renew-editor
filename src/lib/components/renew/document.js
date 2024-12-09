import * as L from 'partial.lenses';
import * as R from 'ramda';

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
						[L.reread(R.always({ minX:  Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }))]
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
