export function bindWheelEvents(element, {eventToWorld, mouseGrab, rotationDelta, zoomDelta}) {
	function onWheel(evt) {
		if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
			if(evt.ctrlKey || mouseGrab.value || evt.defaultPrevented) {
				evt.preventDefault()
				evt.stopPropagation()

				const worldPos = eventToWorld(evt)

				if(evt.shiftKey) {
					rotationDelta.value = {
						px: worldPos.x,
						py: worldPos.y,
						dw: -Math.sign(evt.deltaY)/16 * 90,
					}
				} else {
					zoomDelta.value = {
						px: worldPos.x,
						py: worldPos.y,
						dz: -Math.sign(evt.deltaY)/16,
					}
				}
			}
		} else {
			if(!evt.altKey && !evt.ctrlKey && !mouseGrab.value && !evt.defaultPrevented) {
				return
			}

			evt.preventDefault()
			evt.stopPropagation()

			const worldPos = eventToWorld(evt)

			if(evt.altKey) {
				rotationDelta.value = {
					px: worldPos.x,
					py: worldPos.y,
					dw: -evt.deltaY/100 * 90 * (evt.ctrlKey ? 5 : 1),
				}
			} else {
				zoomDelta.value = {
					px: worldPos.x,
					py: worldPos.y,
					dz: -Math.sign(evt.deltaY)/8,
				}
			}
		}
	}

	element.addEventListener('wheel', onWheel, { passive:false, capture: false })


	return () => {
		element.removeEventListener('wheel', onWheel, { passive:false, capture: false })
	}
}