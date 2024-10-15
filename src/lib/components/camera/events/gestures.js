let gestureBaseRot
	let gestureBaseScale
	let gestureBasePivot = null
	let gestureBasePivotWorld = null
	let prevTouchCount
	function onGestureChange(evt) {
		const dw = Math.atan2(Math.sin((evt.rotation - gestureBaseRot)/180*Math.PI), Math.cos((evt.rotation - gestureBaseRot)/180*Math.PI))*180/Math.PI
		const dz = Math.log(evt.scale) - Math.log(gestureBaseScale)
		const dx = gestureBasePivot.x - evt.clientX
		const dy = gestureBasePivot.y - evt.clientY

		const suddenAngle = Math.abs(dw) > 30
		const suddenZoom = Math.abs(dz) > 0.2
		const suddenPan = Math.hypot(dx, dy) > 15 * window.devicePixelRatio

		if(!suddenAngle /*&& !suddenZoom*/ && !suddenPan) {
			zoomDelta.value = {
				px: gestureBasePivotWorld.x,
				py: gestureBasePivotWorld.y,
				dz: dz,
			}
			rotationDelta.value = {
				px: gestureBasePivotWorld.x,
				py: gestureBasePivotWorld.y,
				dw: dw,
			}
			panScreenDelta.value = {
				dx,
				dy,
			}
		} else {
			gestureBasePivotWorld = L.get(eventWorld, evt)
		}

		gestureBaseScale = evt.scale
		gestureBaseRot = evt.rotation
		gestureBasePivot = {
			x: evt.clientX,
			y: evt.clientY,
		}
	};


	function onGestureStart(evt) {
		gestureBaseRot = evt.rotation
		gestureBaseScale = evt.scale

		gestureBasePivot = {
			x: evt.clientX,
			y: evt.clientY,
		}
		gestureBasePivotWorld = L.get(eventWorld, evt)
	};

	function onGestureEnd(evt) {
		gestureBaseRot = null
		gestureBaseScale = null
		gestureBasePivot = null

	};
