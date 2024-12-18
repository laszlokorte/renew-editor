import * as R from "ramda";
import * as L from "partial.lenses";
import * as M from "$lib/math/utils";
import * as Geo from "$lib/math/geometry";
import {
	atom,
	view,
	read,
	combine,
	combineWithRest,
} from "$lib/reactivity/atom.svelte.js";

const normRot = R.compose(R.add(-180), R.modulo(R.__, 360), R.add(180), R.add(360))

export function rotateWithPivot(delta, orig) {
	const newAngle = normRot(orig.w + delta.dw)

	const dxCam = orig.x - delta.px;
	const dyCam = orig.y - delta.py;
	const deltaSin = Math.sin(-Math.PI * delta.dw / 180)
	const deltaCos = Math.cos(-Math.PI * delta.dw / 180)

	const newX = delta.px + (deltaCos * dxCam - deltaSin * dyCam)
	const newY = delta.py + (deltaSin * dxCam + deltaCos * dyCam)

	return {
		...orig,
		w: newAngle,
		x: newX,
		y: newY,
	}
}

export function rotateWithPivotScreen(delta, orig) {
  	const dxPivot = (delta.px - orig.x);
	const dyPivot = (delta.py - orig.y);
  	const currentSin = Math.sin(-Math.PI / 180 * orig.w)
  	const currentCos = Math.cos(-Math.PI / 180 * orig.w)
  	const pivotWorldX = orig.x + (currentCos*dxPivot - currentSin*dyPivot)
    const pivotWorldY = orig.y + (currentSin*dxPivot + currentCos*dyPivot)

	return rotateWithPivot({px: pivotWorldX, py: pivotWorldY, dw: delta.dw}, orig)
}

export function rotateWithPivotZeroDelta(cam) {
	return {
		dw: 0,
		px: cam.x,
		py: cam.y,
	}
}

export function zoomWithPivot(delta, orig) {
	const newZoom = R.clamp(-8, 8, orig.z + delta.dz)

	const realFactor = newZoom - orig.z;
  	const panFactor = 1 - Math.exp(-realFactor);
  	const newX = M.lerp(orig.x, delta.px, panFactor)
    const newY = M.lerp(orig.y, delta.py, panFactor)

	return {
		...orig,
		z: newZoom,
		x: newX,
		y: newY,
	}
}


export function zoomWithPivotScreen(delta, orig) {
  	const sin = Math.sin(Math.PI / 180 * orig.w)
  	const cos = Math.cos(Math.PI / 180 * orig.w)
  	const dx = (delta.px - orig.x);
	const dy = (delta.py - orig.y);

	return zoomWithPivot({
		px: orig.x + (cos*dx + sin*dy), 
		py: orig.y + (-sin*dx + cos*dy), 
		dz: delta.dz,
	}, orig)
}

export function zoomWithPivotZeroDelta(cam) {
	return {
		dz: 0,
		px: cam.x,
		py: cam.y,
	}
}

export function panWithPivot(delta, orig) {
  	const newX = orig.x + delta.dx
    const newY = orig.y + delta.dy

	return {
		...orig,
		x: newX,
		y: newY,
	}
}

export function panWithPivotScreen(delta, orig) {
  	const sin = Math.sin(Math.PI / 180 * orig.w)
  	const cos = Math.cos(Math.PI / 180 * orig.w)

	return panWithPivot({
		dx: (cos*delta.dx + sin*delta.dy) * Math.exp(-orig.z), 
		dy: (-sin*delta.dx + cos*delta.dy) * Math.exp(-orig.z), 
	}, orig)
}

export function panWithPivotZeroDelta(cam) {
	return {
		dx: 0,
		dy: 0,
	}
}

export function zoomIntoFrame(frame, oldCamera) {
	const rad = Geo.degree2rad(-frame.angle);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	const oldFrameX = oldCamera.plane.x * Math.exp(-oldCamera.focus.z);
	const oldFrameY = oldCamera.plane.y * Math.exp(-oldCamera.focus.z);
	const dz = Math.log(
		Math.min(
			oldFrameY / Math.abs(frame.size.y),
			oldFrameX / Math.abs(frame.size.x),
		),
	);

	return {
		...oldCamera,
		focus: {
			x:
				frame.start.x +
				(cos * frame.size.x + sin * frame.size.y) / 2,
			y:
				frame.start.y +
				(-sin * frame.size.x + cos * frame.size.y) / 2,
			z: R.clamp(-5, 5, oldCamera.focus.z + dz),
			w: -frame.angle,
		},
	};
}