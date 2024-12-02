export const edgeAngle = {
	source: function (edge, wps) {
		const waypointX = wps.length ? wps[0].x : edge.target_x;
		const waypointY = wps.length ? wps[0].y : edge.target_y;

		return (Math.atan2(edge.source_y - waypointY, edge.source_x - waypointX) * 180) / Math.PI;
	},
	target: function (edge, wps) {
		const waypointX = wps.length ? wps[wps.length - 1].x : edge.source_x;
		const waypointY = wps.length ? wps[wps.length - 1].y : edge.source_y;

		return (Math.atan2(edge.target_y - waypointY, edge.target_x - waypointX) * 180) / Math.PI;
	}
};

export const edgePath = {
	linear: function (edge, wps) {
		const waypoints = wps.map(({ x, y }) => `L ${x} ${y}`).join(' ');

		return `M ${edge.source_x} ${edge.source_y} ${waypoints} L ${edge.target_x} ${edge.target_y}`;
	},
	autobezier: function (edge, wps) {
		switch (wps.length) {
			case 0:
				return `M ${edge.source_x} ${edge.source_y} L ${edge.target_x} ${edge.target_y}`;
			case 1:
				return `M ${edge.source_x} ${edge.source_y}  Q ${wps[0].x} ${wps[0].y} ${edge.target_x} ${edge.target_y}`;
			default:
				const points = [{ x: edge.source_x, y: edge.source_y }, ...wps];
				let path = '';
				for (let i = 0; i < wps.length; i++) {
					const x1 = points[i].x;
					const y1 = points[i].y;
					const x2 = points[i + 1].x;
					const y2 = points[i + 1].y;
					path += `Q ${x1} ${y1} ${(x2 + x1) / 2} ${(y2 + y1) / 2}`;
				}
				const waypoints = [{ x: edge.source_x, y: edge.source_y }, ...wps];

				return `M ${edge.source_x} ${edge.source_y} ${path} T ${edge.target_x} ${edge.target_y}`;
		}
	}
};