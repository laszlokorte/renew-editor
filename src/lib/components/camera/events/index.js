import * as L from "partial.lenses";

import {
	atom,
	view,
	read,
	combine,
	combineWithRest,
} from "../../svatom.svelte.js";

import {pivotZoomLens,
pivotRotationLens,
panScreenLens} from './navigation'

export function bindEvents(node, {camera, worldClientIso, errorHandler}) {
	const eventWorld = [L.props('clientX', 'clientY'), L.pick({x: 'clientX', y: 'clientY'}), L.inverse(worldClientIso), L.props('x','y')]

	const zoomDelta = view(['focus', pivotZoomLens], camera)
	const rotationDelta = view(['focus', pivotRotationLens], camera)
	const panScreenDelta = view(['focus', panScreenLens], camera)

	

	const onError = (e) => {
		if(errorHandler) {
			const pos = L.get(eventWorld, {clientX: window.innerWidth / 2, clientY: window.innerHeight / 2})
			errorHandler.value = { msg: e.message, ...pos }
		} else {
			alert(e.message)
		}
	};

	if(typeof window.DragEvent === "undefined") {
		const pos = L.get(eventWorld, {clientX: window.innerWidth / 2, clientY: window.innerHeight / 2})
		errorHandler.value = { msg: "DragEvent not supported", ...pos }
	}

	

	window.addEventListener('error', onError)


	node.addEventListener('wheel', onWheel, { passive:false, capture: false })
	node.addEventListener('pointerdown', onPointerStart, {capture: true})
	node.addEventListener('pointermove', onPointerMove, {capture: true})
	node.addEventListener('pointercancel', onPointerEnd, {capture: true})
	node.addEventListener('lostpointercapture', onPointerLostCapture, {capture: true})
	node.addEventListener('getpointercapture', onPointerGotCapture, {capture: true})
	node.addEventListener('pointerup', onPointerEnd, {capture: true})

	const nativeGestureEvents = (typeof window.GestureEvent) !== "undefined"
	const nativeTouchEvents = (typeof window.TouchEvent) !== "undefined"

	if(nativeGestureEvents) {
		node.addEventListener('gesturestart', onGestureStart, {capture: true})
		node.addEventListener('gestureend', onGestureEnd, {capture: true})
		node.addEventListener('gesturechange', onGestureChange, {capture: true})
	} else if(nativeTouchEvents) {
		node.addEventListener('touchstart', onTouchStartLocal, {capture: true})
		node.addEventListener('touchmove', onTouchMoveLocal, {capture: true})
		node.addEventListener('touchend', onTouchStopLocal, {capture: true})
		node.addEventListener('touchcancel', onTouchStopLocal, {capture: true})
		window.addEventListener('touchmove', onTouchMoveGlobal, {capture: true})
		window.addEventListener('touchstart', onTouchStartGlobal, {capture: true})
		window.addEventListener('touchend', onTouchStopGlobal, {capture: true})
		window.addEventListener('touchcancel', onTouchStopGlobal, {capture: true})
	}


	return () => {
		if(nativeGestureEvents) {
			node.removeEventListener('gesturechange', onGestureStart, {capture: true})
			node.removeEventListener('gesturestart', onGestureChange, {capture: true})
			node.removeEventListener('gestureend', onGestureEnd, {capture: true})
		} else if(nativeTouchEvents) {
			window.removeEventListener('touchcancel', onTouchStopGlobal, {capture: true})
			window.removeEventListener('touchend', onTouchStopGlobal, {capture: true})
			window.removeEventListener('touchstart', onTouchStartGlobal, {capture: true})
			window.removeEventListener('touchmove', onTouchMoveGlobal, {capture: true})
			node.removeEventListener('touchcancel', onTouchStopLocal, {capture: true})
			node.removeEventListener('touchend', onTouchStopLocal, {capture: true})
			node.removeEventListener('touchmove', onTouchMoveLocal, {capture: true})
			node.removeEventListener('touchstart', onTouchStartLocal, {capture: true})
		}
		
		node.removeEventListener('pointerup', onPointerEnd, {capture: true})
		node.removeEventListener('pointermove', onPointerMove, {capture: true})
		node.removeEventListener('lostpointercapture', onPointerLostCapture, {capture: true})
		node.removeEventListener('getpointercapture', onPointerGotCapture, {capture: true})
		node.removeEventListener('pointercancel', onPointerEnd, {capture: true})
		node.removeEventListener('pointerdown', onPointerStart, {capture: true})
		node.removeEventListener('wheel', onWheel, { passive:false, capture: false })

		window.addEventListener('error', onError)
	}
}