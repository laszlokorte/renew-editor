import * as L from "partial.lenses";

import {
	atom,
	view,
	read,
	combine,
	combineWithRest,
} from "$lib/reactivity/atom.svelte.js";

import {bindWheelEvents} from './wheel'
import {bindPointerEvents} from './pointer'
import {bindGestureEvents} from './gestures'
import {bindTouchEvents} from './touch'


export function bindEvents(node, {zoomDelta, rotationDelta, panScreenDelta, eventToWorld}) {
	const mouseGrab = atom(false)

	const nativeGestureEvents = (typeof window.GestureEvent) !== "undefined"
	const nativeTouchEvents = (typeof window.TouchEvent) !== "undefined"


	const disposeWheel = bindWheelEvents(node, {eventToWorld, mouseGrab, rotationDelta, zoomDelta})
	const disposePointer = bindPointerEvents(node, {eventToWorld, mouseGrab, rotationDelta, zoomDelta, panScreenDelta})
	
	const disposeGesture = nativeGestureEvents ? bindGestureEvents(node, {eventToWorld, rotationDelta, zoomDelta, panScreenDelta}) :
		(nativeTouchEvents ? bindTouchEvents(node, {eventToWorld, rotationDelta, zoomDelta, panScreenDelta}) :
				 () => {})

	return {
		destroy() {
			disposeGesture()
			disposePointer()
			disposeWheel()
		},
	}
}