import * as L from "partial.lenses";
import {screenToElementViewbox, elementViewboxToScreen} from "./functions";
import * as Geo from "$lib/math/geometry";
import {cameraAsViewbox} from "./functions";


export function constructLenses(svgAtom, cameraAtom) {
	function clientToCanvas(x, y, screen = false) {
		const cameraValue = cameraAtom.value
		const screenPoint = screenToElementViewbox(
			x,
			y,
			svgAtom.value,
			cameraAsViewbox(cameraValue),
		);

		if (screen) {
			return screenPoint;
		} else {
			return Geo.rotatePivotXYDegree(
				cameraValue.focus.x,
				cameraValue.focus.y,
				-cameraValue.focus.w,
				screenPoint,
			);
		}
	}

	function clientToCanvasV(v) {
		return clientToCanvas(v.x, v.y);
	}

	function canvasToClient(x, y, screen = false) {
		const cameraValue = cameraAtom.value
		const screenPos = screen
			? { x, y }
			: Geo.rotatePivotXYDegree(
					cameraValue.focus.x,
					cameraValue.focus.y,
					cameraValue.focus.w,
					{ x, y },
				);

		return elementViewboxToScreen(
			screenPos.x,
			screenPos.y,
			svgAtom.value,
			cameraAsViewbox(cameraValue),
		);
	}

	function clientToPage({ x, y }) {
		return {
			x: x + window.scrollX,
			y: y + window.scrollY,
		};
	}

	function pageToClient({ x, y }) {
		return {
			x: x - window.scrollX,
			y: y - window.scrollY,
		};
	}

	const worldPageIso = L.iso(
		(v) => (v ? clientToPage(canvasToClient(v.x, v.y)) : v),
		(v) => (v ? clientToCanvasV(pageToClient(v.x, v.y)) : v),
	);

	const worldClientIso = L.iso(
		(v) => (v ? canvasToClient(v.x, v.y) : v),
		(v) => (v ? clientToCanvas(v.x, v.y) : v),
	);

	return {
		clientToCanvas,
		canvasToClient,
		clientToPage,
		pageToClient,
		worldPageIso,
		worldClientIso,
	}
}