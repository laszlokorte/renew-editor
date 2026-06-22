function finite(...vals) {
	return vals.every((v) => Number.isFinite(v));
}

function elbowHorizontalDominant(edge) {
	return Math.abs(edge.target_x - edge.source_x) >= Math.abs(edge.target_y - edge.source_y);
}

// The single stored "control" waypoint of an elbow connection (the crossbar position).
// Everything else is derived from the endpoints, so the shape stays orthogonal as the
// bonded figures move while still honouring a user-dragged crossbar.
export function elbowControl(wps) {
	const c = Array.isArray(wps)
		? wps.find((w) => !w?.__elbow_bend && w && Number.isFinite(w.x) && Number.isFinite(w.y))
		: null;
	return c ? { x: c.x, y: c.y, id: c.id } : null;
}

// The two bend points of the Z-shape, mirroring Renew's ElbowConnection.updatePoints().
// A stored control waypoint represents the movable crossbar position. If there is no
// stored control point, the crossbar is derived from the current endpoints.
// Returns [] when the endpoints are axis-aligned (straight line).
export function elbowPoints(edge, wps) {
	if (!edge || !finite(edge.source_x, edge.source_y, edge.target_x, edge.target_y)) {
		return [];
	}

	const { source_x: sx, source_y: sy, target_x: tx, target_y: ty } = edge;
	if (sx === tx || sy === ty) {
		return [];
	}

	const control = elbowControl(wps);

	if (elbowHorizontalDominant(edge)) {
		const cx = Number.isFinite(control?.x) ? control.x : (sx + tx) / 2;
		return [
			{ x: cx, y: sy, __elbow_bend: true },
			{ x: cx, y: ty, __elbow_bend: true }
		];
	}

	const cy = Number.isFinite(control?.y) ? control.y : (sy + ty) / 2;
	return [
		{ x: sx, y: cy, __elbow_bend: true },
		{ x: tx, y: cy, __elbow_bend: true }
	];
}

// Where the elbow's crossbar control point should sit (the midpoint of the middle
// segment), used both for rendering its handle and for the position we persist.
export function elbowControlPoint(edge, wps) {
	const bends = elbowPoints(edge, wps);
	if (bends.length < 2) {
		return null;
	}

	return {
		x: (bends[0].x + bends[1].x) / 2,
		y: (bends[0].y + bends[1].y) / 2,
		axis: elbowHorizontalDominant(edge) ? 'x' : 'y'
	};
}

// Yellow handles at every segment midpoint (Renew adds one ElbowHandle per segment).
// A horizontal segment is moved by changing its y coordinate, a vertical segment by
// changing its x coordinate.
export function elbowHandlePoints(edge, wps) {
	const bends = elbowPoints(edge, wps);
	if (!bends.length) {
		return [];
	}

	const points = [
		{ x: edge.source_x, y: edge.source_y },
		...bends,
		{ x: edge.target_x, y: edge.target_y }
	];

	const handles = [];
	for (let i = 0; i < points.length - 1; i += 1) {
		const verticalSegment = points[i].x === points[i + 1].x;
		handles.push({
			x: (points[i].x + points[i + 1].x) / 2,
			y: (points[i].y + points[i + 1].y) / 2,
			draggable: true,
			segment: i,
			axis: verticalSegment ? 'x' : 'y'
		});
	}

	return handles;
}

function angleBetween(fromX, fromY, toX, toY) {
	return (Math.atan2(fromY - toY, fromX - toX) * 180) / Math.PI;
}

export const edgeAngle = {
	source: function (edge, wps) {
		if (edge?.style?.smoothness === 'elbow') {
			const pts = elbowPoints(edge, wps);
			const next = pts.length ? pts[0] : { x: edge.target_x, y: edge.target_y };
			return angleBetween(edge.source_x, edge.source_y, next.x, next.y);
		}

		const waypointX = wps.length ? wps[0].x : edge.target_x;
		const waypointY = wps.length ? wps[0].y : edge.target_y;

		return (Math.atan2(edge.source_y - waypointY, edge.source_x - waypointX) * 180) / Math.PI;
	},
	target: function (edge, wps) {
		if (edge?.style?.smoothness === 'elbow') {
			const pts = elbowPoints(edge, wps);
			const prev = pts.length ? pts[pts.length - 1] : { x: edge.source_x, y: edge.source_y };
			return angleBetween(edge.target_x, edge.target_y, prev.x, prev.y);
		}

		const waypointX = wps.length ? wps[wps.length - 1].x : edge.source_x;
		const waypointY = wps.length ? wps[wps.length - 1].y : edge.source_y;

		return (Math.atan2(edge.target_y - waypointY, edge.target_x - waypointX) * 180) / Math.PI;
	}
};

export const edgePath = {
	linear: function (edge, wps) {
		const waypoints = wps.map(({ x, y }) => `L ${x} ${y}`).join(' ');

		return (
			`M ${edge.source_x} ${edge.source_y} ${waypoints} L ${edge.target_x} ${edge.target_y}` +
			(edge.cyclic ? 'z' : '')
		);
	},
	elbow: function (edge, wps) {
		// Orthogonal routing derived from the endpoints plus an optional control
		// waypoint (the crossbar position); see elbowPoints.
		const mid = elbowPoints(edge, wps)
			.map(({ x, y }) => `L ${x} ${y}`)
			.join(' ');

		return (
			`M ${edge.source_x} ${edge.source_y} ${mid} L ${edge.target_x} ${edge.target_y}` +
			(edge.cyclic ? 'z' : '')
		);
	},
	autobezier: function (edge, wps) {
		switch (wps.length) {
			case 0:
				return `M ${edge.source_x} ${edge.source_y} L ${edge.target_x} ${edge.target_y}`;
			case 1:
				return (
					`M ${edge.source_x} ${edge.source_y}` +
					(edge.cyclic
						? `  Q ${wps[0].x} ${wps[0].y} ${edge.target_x} ${edge.target_y} C ${2 * edge.target_x - wps[0].x} ${2 * edge.target_y - wps[0].y} ${2 * edge.source_x - wps[0].x} ${2 * edge.source_y - wps[0].y}  ${edge.source_x} ${edge.source_y} z`
						: `  Q ${wps[0].x} ${wps[0].y} ${edge.target_x} ${edge.target_y}`)
				);
			default:
				const points = [{ x: edge.source_x, y: edge.source_y }, ...wps];
				if (edge.cyclic) {
					points.push({ x: edge.target_x, y: edge.target_y });
					points.push({ x: 2 * edge.source_x - wps[0].x, y: 2 * edge.source_y - wps[0].y });
				}
				let path = '';
				for (let i = 0; i < points.length - 1; i++) {
					const x1 = points[i].x;
					const y1 = points[i].y;
					const x2 = points[i + 1].x;
					const y2 = points[i + 1].y;
					path += `Q ${x1} ${y1} ${(x2 + x1) / 2} ${(y2 + y1) / 2}`;
				}

				return (
					`M ${edge.source_x} ${edge.source_y} ${path}` +
					(edge.cyclic
						? `T ${edge.source_x} ${edge.source_y}`
						: `T ${edge.target_x} ${edge.target_y}`)
				);
		}
	}
};

export function tipColor(_background, stroke, fallback) {
	if (stroke && stroke !== 'transparent') {
		return stroke;
	} else {
		return fallback;
	}
}
