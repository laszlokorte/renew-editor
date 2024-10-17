import * as L from "partial.lenses";


import {
	view,
} from "$lib/reactivity/atom.svelte.js";

export function bindPointerEvents(element, {eventToWorld, mouseGrab, rotationDelta, zoomDelta, panScreenDelta}) {

	const mouseGrabPointerId = view([L.removable('pointerId'), 'pointerId'], mouseGrab)
	const mouseGrabXY = view([L.props('x','y')], mouseGrab)
	const mouseGrabWorld = view([L.pick({
		x:'worldX',
		y:'worldY',
	})], mouseGrab)

	function onPointerStart(evt) {
		if(evt.pointerType === 'mouse' && evt.button === 1 && evt.shiftKey) {
			evt.preventDefault()
			element.setPointerCapture(evt.pointerId)
			mouseGrab.value = {
				pointerId: evt.pointerId,
				x: evt.clientX,
				y: evt.clientY,
				world: eventToWorld(evt),
			}
		}
	}

	function onPointerLostCapture(evt) {
		if(mouseGrabPointerId.value == evt.pointerId) {
			mouseGrabPointerId.value = undefined
		}
	}

	function onPointerMove(evt) {
		if(mouseGrabPointerId.value === evt.pointerId) {
			const xy = mouseGrabXY.value
			const world = mouseGrabWorld.value
			const dx = xy.x - evt.clientX
			const dy = xy.y - evt.clientY

			
			if(evt.ctrlKey) {
				const sign = Math.sign(dx)
				zoomDelta.value = {
					px: world.x,
					py: world.y,
					dz: -sign*Math.hypot(dx,dy)/128,
				}
			} else if(evt.altKey) {
				const sign = Math.sign(dx)
					rotationDelta.value = {
						px: world.x,
						py: world.y,
						dw: -sign*Math.hypot(dx,dy),
					}
			} else {
				panScreenDelta.value = {
					dx,
					dy,
				}
			}

			mouseGrabXY.value = {
				x: evt.clientX,
				y: evt.clientY,
			}
		}
	}

	element.addEventListener('pointerdown', onPointerStart, {capture: true})
	element.addEventListener('pointermove', onPointerMove, {capture: true})
	element.addEventListener('lostpointercapture', onPointerLostCapture, {capture: true})

	return () => {
		element.removeEventListener('lostpointercapture', onPointerLostCapture, {capture: true})
		element.removeEventListener('pointermove', onPointerMove, {capture: true})
		element.removeEventListener('pointerdown', onPointerStart, {capture: true})
	}
}
