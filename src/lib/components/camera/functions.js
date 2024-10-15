

export const cameraAsViewbox = (camera) => {
	return {
		alignmentX: camera.frame.alignX,
		alignmentY: camera.frame.alignY,
		width: camera.plane.x * Math.exp(-camera.focus.z),
		height: camera.plane.y * Math.exp(-camera.focus.z),
		minX:
			camera.focus.x -
			(camera.plane.x / 2) * Math.exp(-camera.focus.z),
		minY:
			camera.focus.y -
			(camera.plane.y / 2) * Math.exp(-camera.focus.z),
		scaling: camera.frame.aspect,
	};
};



function screenToElementViewboxHelper(clientX, clientY, elementX, elementY, elementWidth, elementHeight, localWidth, localHeight, viewBox) {
    const scaledVB = scaleViewBox(viewBox, localWidth, localHeight)

    return {
        x: scaledVB.minX + scaledVB.width * ((clientX - elementX) / elementWidth),
        y: scaledVB.minY + scaledVB.height * ((clientY - elementY) / elementHeight),
    }
}

export function screenToElementViewbox(clientX, clientY, element, viewBox) {
    if(!element) {
        return {x:0,y:0}
    }

    const boundingRect = element.getBoundingClientRect();
    
    return screenToElementViewboxHelper(
        clientX, clientY,
        boundingRect.left, boundingRect.top, 
        boundingRect.width, boundingRect.height, 
        element.clientWidth, element.clientHeight, 
        viewBox
    )
}

function elementViewboxToScreenHelper(viewboxX, viewboxY, elementX, elementY, elementWidth, elementHeight, localWidth, localHeight, viewBox) {
    const scaledVB = scaleViewBox(viewBox, localWidth, localHeight)

    return {
        x: elementX + elementWidth * ((viewboxX - scaledVB.minX) / scaledVB.width),
        y: elementY + elementHeight * ((viewboxY - scaledVB.minY) / scaledVB.height),
    }
}

export function elementViewboxToScreen(viewportX, viewportY, element, viewBox) {
    if(!element) {
        return {x:0,y:0}
    }
    const boundingRect = element.getBoundingClientRect();


    return elementViewboxToScreenHelper(
        viewportX, viewportY,
        boundingRect.left, boundingRect.top, 
        boundingRect.width, boundingRect.height, 
        element.clientWidth, element.clientHeight, 
        viewBox
    )
}