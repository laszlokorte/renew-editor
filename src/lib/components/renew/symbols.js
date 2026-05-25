export function buildCoord(box, dim, relative, coord) {
	const units = {
		maxsize: Math.max(box.width, box.height),
		minsize: Math.min(box.width, box.height),
		width: box.width,
		height: box.height
	};

	const sizes = {
		x: 'width',
		y: 'height'
	};

	const ops = {
		max: (a, b) => Math.max(a, b),
		min: (a, b) => Math.min(a, b),
		sum: (a, b) => a + b
	};

	const origin = box[dim];
	const base = coord.value * units[coord.unit];
	const offset = ops[coord.offset.operation](
		coord.offset.value_static,
		units[coord.offset.dynamic_unit] * coord.offset.dynamic_value
	);

	return (relative ? base : base + origin) + offset;
}

export function buildStep(box, startPos, { x: currentX, y: currentY }, step) {
	const relative = !!step.relative;
	const vertical = !!step.vertical;
	const horizontal = !!step.horizontal;
	const diagonal = vertical && horizontal;
	const arc = !!step.arc;

	if (arc) {
		const rx = buildCoord(box, 'x', true, step.arc.rx);
		const ry = buildCoord(box, 'y', true, step.arc.ry);
		const params =
			rx +
			',' +
			ry +
			',' +
			(step.arc.angle ? 1 : 0) +
			',' +
			(step.arc.sweep ? 1 : 0) +
			',' +
			(step.arc.large ? 1 : 0);

		if (diagonal) {
			const x = buildCoord(box, 'x', step.relative, step.horizontal);
			const y = buildCoord(box, 'y', step.relative, step.vertical);

			return {
				string: (relative ? 'a' : 'A') + params + ',' + x + ',' + y,
				pos: relative
					? {
							x: currentX + x,
							y: currentY + y
						}
					: {
							x,
							y
						}
			};
		} else if (vertical) {
			const y = buildCoord(box, 'y', step.relative, step.vertical);
			return {
				string: (relative ? 'a' : 'A') + params + ',' + (relative ? 0 : currentX) + ',' + y,
				pos: relative
					? {
							x: currentX,
							y: currentY + y
						}
					: {
							x: currentX,
							y
						}
			};
		} else if (horizontal) {
			const x = buildCoord(box, 'x', step.relative, step.horizontal);
			return {
				string: (relative ? 'a' : 'A') + params + ',' + x + ',' + (relative ? 0 : currentY),
				pos: relative
					? {
							x: currentX + x,
							y: currentY
						}
					: {
							x,
							y: currentY
						}
			};
		} else {
			return {
				string:
					(relative ? 'a' : 'A') +
					params +
					',' +
					(relative ? 0 : currentX) +
					',' +
					(relative ? 0 : currentY),
				pos: relative
					? {
							x: currentX + x,
							y: currentY + y
						}
					: {
							x: currentX,
							y: currentY
						}
			};
		}
	} else {
		if (diagonal) {
			const x = buildCoord(box, 'x', step.relative, step.horizontal);
			const y = buildCoord(box, 'y', step.relative, step.vertical);
			return {
				string: (relative ? 'l' : 'L') + x + ',' + y,
				pos: relative
					? {
							x: currentX + x,
							y: currentY + y
						}
					: {
							x,
							y
						}
			};
		} else if (vertical) {
			const y = buildCoord(box, 'y', step.relative, step.vertical);
			return {
				string: (relative ? 'v' : 'V') + y,
				pos: relative
					? {
							x: currentX,
							y: currentY + y
						}
					: {
							x: currentX,
							y
						}
			};
		} else if (horizontal) {
			const x = buildCoord(box, 'x', step.relative, step.horizontal);
			return {
				string: (relative ? 'h' : 'H') + x,
				pos: relative
					? {
							x: currentX + x,
							y: currentY
						}
					: {
							x,
							y: currentY
						}
			};
		} else {
			return {
				string: relative ? 'z' : 'Z',
				pos: startPos
			};
		}
	}
}

export function buildPath(box, path) {
	return path.segments
		.map((segment) => {
			const start = {
				x: buildCoord(box, 'x', segment.relative, segment.x),
				y: buildCoord(box, 'y', segment.relative, segment.y)
			};

			return segment.steps.reduce(
				({ string: accString, pos: currentPos }, step) => {
					const currentStep = buildStep(box, start, currentPos, step);
					return {
						string: accString + currentStep.string,
						pos: currentStep.pos
					};
				},
				{
					string: `${segment.relative ? 'm' : 'M'} ${start.x} ${start.y}`,
					pos: start
				}
			).string;
		})
		.join(' ');
}

/**
 * Build the SVG path for a Renew PieFigure.
 *
 * Renew stores free-angle pie geometry separately from the static symbol shape.
 * The angle convention mirrors the server-side Renew renderer: degrees measured
 * counter-clockwise with the SVG y-axis inverted at the point conversion step.
 */
export function buildPiePath(box, startAngle, endAngle) {
	const start = startAngle == null || !Number.isFinite(Number(startAngle)) ? 0 : Number(startAngle);
	const end = endAngle == null || !Number.isFinite(Number(endAngle)) ? 180 : Number(endAngle);
	const rx = box.width / 2;
	const ry = box.height / 2;
	const cx = box.x + rx;
	const cy = box.y + ry;

	const startRadians = (Math.PI / 180) * start;
	const endRadians = (Math.PI / 180) * end;
	const cosStart = Math.cos(startRadians);
	const sinStart = Math.sin(startRadians);
	const cosEnd = Math.cos(endRadians);
	const sinEnd = Math.sin(endRadians);

	const dot = cosStart * cosEnd + sinStart * sinEnd;
	const det = cosStart * sinEnd - sinStart * cosEnd;
	const angleDiff = (Math.atan2(-det, -dot) * 180) / Math.PI + 180;
	const largeArcFlag = angleDiff < 180 ? 0 : 1;

	return `M ${cx}, ${cy} L ${cx + cosStart * rx}, ${cy - sinStart * ry} A ${rx} ${ry} 0 ${largeArcFlag} 0 ${cx + cosEnd * rx}, ${cy - sinEnd * ry} z`;
}
