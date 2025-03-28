import * as Geo from "$lib/math/geometry";
import * as R from "ramda";
import * as L from "partial.lenses";
import * as P from "$lib/math/projection";
import {cameraAsViewbox } from "./functions";
import {rotateWithPivot, zoomWithPivot, 
zoomWithPivotScreen, zoomWithPivotZeroDelta, 
rotateWithPivotZeroDelta, panWithPivotZeroDelta, 
rotateWithPivotScreen, panWithPivotScreen } from "./navigation";

export const frameBoxLens = L.reread((camera) => {
	const { minX, minY, width, height } = P.scaleViewBox(
		cameraAsViewbox(camera),
		camera.frame.size.x,
		camera.frame.size.y,
		0,
	);

	return {
		screenSpaceAligned: { minX, minY, width, height },
		worldSpace: {
			a: Geo.rotatePivotXYDegree(
				camera.focus.x,
				camera.focus.y,
				-camera.focus.w,
				{ x: minX, y: minY },
			),
			b: Geo.rotatePivotXYDegree(
				camera.focus.x,
				camera.focus.y,
				-camera.focus.w,
				{ x: minX + width, y: minY },
			),
			c: Geo.rotatePivotXYDegree(
				camera.focus.x,
				camera.focus.y,
				-camera.focus.w,
				{ x: minX + width, y: minY + height },
			),
			d: Geo.rotatePivotXYDegree(
				camera.focus.x,
				camera.focus.y,
				-camera.focus.w,
				{ x: minX, y: minY + height },
			),
		},
	};
});



export const panMovementLens = [
	"focus",
	L.props("x", "y"),
	L.lens(R.always({ x: 0, y: 0 }), (delta, { x, y }) => {
		return {
			x: x + delta.dx,
			y: y + delta.dy,
		};
	}),
];

export const rotateMovementLens = [
	"focus",
	L.props("w", "x", "y"),
	L.lens(
		R.compose(
			R.assoc("dw", 0),
			R.zipObj(["px", "py"]),
			R.props(["x", "y"]),
		),
		rotateWithPivot,
	),
];

export const zoomMovementLens = [
	"focus",
	L.props("z", "x", "y"),
	L.lens(
		R.compose(
			R.assoc("dz", 0),
			R.zipObj(["px", "py"]),
			R.props(["x", "y"]),
		),
		zoomWithPivot,
	),
];


export const pivotZoomLens = L.lens(zoomWithPivotZeroDelta, zoomWithPivot)
export const pivotRotationLens =  L.lens(rotateWithPivotZeroDelta, rotateWithPivot)
export const pivotZoomScreenLens = L.lens(zoomWithPivotZeroDelta, zoomWithPivotScreen)
export const pivotRotationScreenLens =  L.lens(rotateWithPivotZeroDelta, rotateWithPivotScreen)
export const panScreenLens =  L.lens(panWithPivotZeroDelta, panWithPivotScreen)