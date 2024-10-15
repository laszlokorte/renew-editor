

	
	let mouseGrab
	function onPointerStart(evt) {
		if(evt.pointerType === 'mouse' && evt.button === 1 && evt.shiftKey) {
			evt.preventDefault()
			node.setPointerCapture(evt.pointerId)
			mouseGrab = {
				pointerId: evt.pointerId,
				x: evt.clientX,
				y: evt.clientY,
				world: L.get(eventWorld, evt),
			}
		}
	}

	function onPointerEnd(evt) {
	}

	function onPointerGotCapture(evt) {
	}

	function onPointerLostCapture(evt) {
		if(mouseGrab && mouseGrab.pointerId == evt.pointerId) {
			mouseGrab = undefined
		}
	}

	function onPointerMove(evt) {
		if(mouseGrab && mouseGrab.pointerId === evt.pointerId) {
			const dx = mouseGrab.x - evt.clientX
			const dy = mouseGrab.y - evt.clientY

			
			if(evt.ctrlKey) {
				const sign = Math.sign(dx)
				zoomDelta.value = {
					px: mouseGrab.world.x,
					py: mouseGrab.world.y,
					dz: -sign*Math.hypot(dx,dy)/128,
				}
			} else if(evt.altKey) {
				const sign = Math.sign(dx)
					rotationDelta.value = {
						px: mouseGrab.world.x,
						py: mouseGrab.world.y,
						dw: -sign*Math.hypot(dx,dy),
					}
			} else {
				panScreenDelta.value = {
					dx,
					dy,
				}
			}

			mouseGrab.x = evt.clientX
			mouseGrab.y = evt.clientY
		}
	}