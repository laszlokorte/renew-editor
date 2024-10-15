
export function scaleViewBox({
    alignmentX,
    alignmentY,
    width,
    height,
    minX,
    minY,
    scaling,
}, targetWidth, targetHeight, padding = 0) {
    if(!scaling) {
        const hPad = padding * targetWidth?width/targetWidth:1;
        const vPad = padding * targetHeight?height/targetHeight:1;

        return {
            minX: minX + hPad,
            minY: minY + vPad,
            width: Math.max(width - 2 * hPad, 0),
            height: Math.max(height - 2 * vPad, 0),
        }
    } else {
        const factor = {
            'meet': Math.max,
            'slice': Math.min,
        }[scaling].call(Math, targetWidth?width/targetWidth:1, targetHeight?height/targetHeight:1)

        const actualWidth = targetWidth * factor
        const actualHeight = targetHeight * factor
        const extraWidth = actualWidth - width
        const extraHeight = actualHeight - height

        const alignmentWeights = {
            'Min': 0,
            'Mid': 0.5,
            'Max': 1,
        };
        
        const extraWeightingX = alignmentWeights[alignmentX];
        const extraWeightingY = alignmentWeights[alignmentY];

        const actualPadding = factor * padding;

        return {
            minX:  minX - extraWeightingX * extraWidth + actualPadding,
            minY: minY - extraWeightingY * extraHeight + actualPadding,
            width: Math.max(actualWidth - 2*actualPadding, 0),
            height: Math.max(actualHeight - 2*actualPadding, 0),
        }
    }
}
