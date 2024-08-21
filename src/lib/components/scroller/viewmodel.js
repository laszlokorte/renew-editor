import * as L from "partial.lenses";
import * as R from "ramda";
import {
	atom,
	viewCombined,
	readCombined,
} from "$lib/reactivity/atom.svelte.js"

function combineScrollPadding({alignment, extraScrollPadding, scrollWindowSize, contentSize}){
 	if(extraScrollPadding) {
 		return ({
			left: scrollWindowSize.x,
			top: scrollWindowSize.y,
			right: scrollWindowSize.x + (alignment == 'center' ? 0 : Math.max(0, scrollWindowSize.x - contentSize.x)),
			bottom: scrollWindowSize.y + (alignment == 'center' ? 0 : Math.max(0, scrollWindowSize.y - contentSize.y)),
		})
	} else {
 		return ({top:0,left:0,bottom:0,right:0})
	}
}

function combinePaddedContentSize({scrollPadding, contentSize}) {
	return {
		x: scrollPadding.left + scrollPadding.right + contentSize.x,
		y: scrollPadding.top + scrollPadding.bottom + contentSize.y
	}
}

function getAdjustedScrollPosition({ scrollPosition, scrollWindowSize, contentSize, overscroll, scrollPadding }) {
	return ({
		x: R.clamp(-scrollPadding.left, Math.max(0, contentSize.x - Math.floor(scrollWindowSize.x) - scrollPadding.left + 1), scrollPosition.x) + overscroll.x + scrollPadding.left,
		y: R.clamp(-scrollPadding.top, Math.max(0, contentSize.y - Math.floor(scrollWindowSize.y) - scrollPadding.top + 1), scrollPosition.y) + overscroll.y + scrollPadding.top,
	})
}

function setAdjustedScrollPosition(scrollPosition, { scrollWindowSize, contentSize, scrollPadding }) {
	const clampedX = R.clamp(-scrollPadding.left, Math.max(scrollPadding.left, contentSize.x - Math.floor(scrollWindowSize.x)- scrollPadding.left + 1), scrollPosition.x - scrollPadding.left)
	const clampedY = R.clamp(-scrollPadding.top, Math.max(scrollPadding.top, contentSize.y - Math.floor(scrollWindowSize.y)- scrollPadding.top + 1), scrollPosition.y - scrollPadding.top)


	return {
		scrollWindowSize,
		contentSize,
		scrollPosition: {
			atMinX: scrollPosition.atMinX,
			atMaxX: scrollPosition.atMaxX,
			atMinY: scrollPosition.atMinY,
			atMaxY: scrollPosition.atMaxY,
			x: clampedX,
			y: clampedY,
		},
		overscroll: {
			x:  scrollPosition.x - scrollPadding.left - clampedX,
			y:  scrollPosition.y - scrollPadding.top - clampedY,
		}
	}
}

const combineScrollPaddingLens = L.reread(combineScrollPadding)
const combinePaddedContentSizeLens = L.reread(combinePaddedContentSize)
const adjustedScrollPositionLens = L.lens(getAdjustedScrollPosition, setAdjustedScrollPosition)

export default function scrollerViewModel(alignment, scrollPosition, contentSize, scrollWindowSize, extraScrollPadding, allowOverscroll) {
	const overscroll = atom({x:0,y:0})
	const scrollPadding = readCombined(combineScrollPaddingLens, {alignment, extraScrollPadding, scrollWindowSize, contentSize}, {})
	const paddedContentSize = readCombined(combinePaddedContentSizeLens, {scrollPadding, contentSize}, {})
	const adjustedScrollPosition = viewCombined(adjustedScrollPositionLens, {
		scrollPosition,
		scrollWindowSize,
		contentSize: paddedContentSize,
		overscroll,
		scrollPadding
	}, {
		scrollPosition: true,
		overscroll: true,
	});

	return {
		get values() {
			return {
				allowOverscroll: allowOverscroll.value,
				paddedContentSize: paddedContentSize.value,
				scrollPosition: scrollPosition.value,
			}
		},

		get bindings() {
			return {
				adjustedScrollPosition,
				scrollWindowSize,
			}
		},
	}

}