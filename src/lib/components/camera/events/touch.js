function touchesCenter(touches) {
	let sumX = 0;
	let sumY = 0;

	for(let t=touches.length-1;t>=0;t--) {
		sumX += touches[t].clientX
		sumY += touches[t].clientY
	}

	return {
		x: sumX / touches.length,
		y: sumY / touches.length
	}
}

function touchesAngle(center, touches) {
	let sum = 0;

	for(let t=touches.length-1;t>=0;t--) {
		const d = Math.atan2(touches[t].clientY - center.y, touches[t].clientX - center.x)
		sum += d
	}

	return sum
}

function touchesDistance(center, touches) {
	let sum = 0;

	for(let t=touches.length-1;t>=0;t--) {
		const d = Math.hypot(touches[t].clientX - center.x, touches[t].clientY - center.y)
		sum += d
	}

	return (sum / touches.length)
}

export function bindTouchEvents(element, {eventToWorld, rotationDelta, zoomDelta, panScreenDelta}) {
	let localTouches = []
	let touchBaseRot = 0
	let touchBaseScale = 1
	let touchBasePivot = {x:0, y:0}
	let touchBasePivotWorld = {x:0, y:0}

	function onTouchStartLocal(evt) {
		localTouches = evt.targetTouches

		touchBasePivot = touchesCenter(evt.touches)
		touchBasePivotWorld = eventToWorld({clientX: touchBasePivot.x, clientY: touchBasePivot.y})
		touchBaseScale = touchesDistance(touchBasePivot, evt.touches)
		touchBaseRot = touchesAngle(touchBasePivot, evt.touches)
	}

	function onTouchStopLocal(evt) {
		localTouches = evt.targetTouches

		if(evt.touches.length < 2 || localTouches.length < 1) {
			touchBaseRot = 0
			touchBaseScale = 1
			touchBasePivot = {x:0, y:0}
			touchBasePivotWorld = {x:0, y:0}
		}
	}

	function onTouchStartGlobal(evt) {
		if(evt.touches.length > 1 && localTouches.length > 0) {
			evt.preventDefault()
			touchBasePivot = touchesCenter(evt.touches)
			touchBaseScale = touchesDistance(touchBasePivot, evt.touches)
			touchBaseRot = touchesAngle(touchBasePivot, evt.touches)
		}
	}

	function onTouchStopGlobal(evt) {
		if(evt.touches.length > 1 && localTouches.length > 0) {
			evt.preventDefault()
			touchBasePivot = touchesCenter(evt.touches)
			touchBaseScale = touchesDistance(touchBasePivot, evt.touches)
			touchBaseRot = touchesAngle(touchBasePivot, evt.touches)
		}
	}

	function onTouchMoveLocal(evt) {
		if(evt.touches.length > 1 && localTouches.length > 0) {
			evt.preventDefault()
		}
	}

	function onTouchMoveGlobal(evt) {
		if(evt.touches.length > 1 && localTouches.length > 0) {
			evt.preventDefault()
			
			const newPivot = touchesCenter(evt.touches)
			const newScale = touchesDistance(newPivot, evt.touches)
			const newAngle = touchesAngle(newPivot, evt.touches)

			const dx = touchBasePivot.x - newPivot.x
			const dy = touchBasePivot.y - newPivot.y
			const dz = Math.log(newScale) - Math.log(touchBaseScale)
			const dw = Math.atan2(Math.sin((newAngle - touchBaseRot)), Math.cos((newAngle - touchBaseRot)))*180/Math.PI

			zoomDelta.value = {
				px: touchBasePivotWorld.x,
				py: touchBasePivotWorld.y,
				dz: dz,
			}
			rotationDelta.value = {
				px: touchBasePivotWorld.x,
				py: touchBasePivotWorld.y,
				dw: dw / evt.touches.length,
			}
			panScreenDelta.value = {
				dx,
				dy,
			}

			touchBasePivot = newPivot
			touchBaseScale = newScale
			touchBaseRot = newAngle
		}
	}


		element.addEventListener('touchstart', onTouchStartLocal, {capture: true})
		element.addEventListener('touchmove', onTouchMoveLocal, {capture: true})
		element.addEventListener('touchend', onTouchStopLocal, {capture: true})
		element.addEventListener('touchcancel', onTouchStopLocal, {capture: true})
		window.addEventListener('touchmove', onTouchMoveGlobal, {capture: true})
		window.addEventListener('touchstart', onTouchStartGlobal, {capture: true})
		window.addEventListener('touchend', onTouchStopGlobal, {capture: true})
		window.addEventListener('touchcancel', onTouchStopGlobal, {capture: true})

	return () => {

		window.removeEventListener('touchcancel', onTouchStopGlobal, {capture: true})
		window.removeEventListener('touchend', onTouchStopGlobal, {capture: true})
		window.removeEventListener('touchstart', onTouchStartGlobal, {capture: true})
		window.removeEventListener('touchmove', onTouchMoveGlobal, {capture: true})
		element.removeEventListener('touchcancel', onTouchStopLocal, {capture: true})
		element.removeEventListener('touchend', onTouchStopLocal, {capture: true})
		element.removeEventListener('touchmove', onTouchMoveLocal, {capture: true})
		element.removeEventListener('touchstart', onTouchStartLocal, {capture: true})
		
	}
}
