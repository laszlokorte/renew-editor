import * as L from "partial.lenses";
import * as R from "ramda";
import {
	atom,
	view,
	read,
	combine,
	bindScroll,
	bindSize,
} from "./svatom.svelte.js";

export default function scrollerViewModel(alignment, scrollPosition, contentSize, scrollWindowSize, extraScrollPadding, allowOverscroll) {
	const numberFormat = new Intl.NumberFormat("en-US", {
	    minimumFractionDigits: 2,
	    maximumFractionDigits: 2,
	    useGrouping: false,
	});


	const browserChromeOverscroll = atom({x:0,y:0})

	const scrollPadding = read(L.reread(({auto, winSize, conSize}) => auto ? ({
		left: winSize.x,
		top: winSize.y,
		right: winSize.x + (alignment == 'center' ? 0 : Math.max(0, winSize.x - conSize.x)),
		bottom: winSize.y + (alignment == 'center' ? 0 : Math.max(0, winSize.y - conSize.y)),
	}) : ({top:0,left:0,bottom:0,right:0})), combine({auto: extraScrollPadding, winSize: scrollWindowSize, conSize: contentSize}, {}))
	const paddedContentSize = read(L.reread(({pad, conSize}) => ({
		x: pad.left + pad.right + conSize.x,
		y: pad.top + pad.bottom + conSize.y
	})), combine({pad: scrollPadding, conSize: contentSize}, {}))

	const adjustedScrollPosition = view(L.lens(({ pos, windowSize, conSize, o, pad }) => ({
			x: R.clamp(-pad.left, Math.max(0, conSize.x - Math.floor(windowSize.x) - pad.left + 1), pos.x) + o.x + pad.left,
			y: R.clamp(-pad.top, Math.max(0, conSize.y - Math.floor(windowSize.y) - pad.top + 1), pos.y) + o.y + pad.top,
		}), (pos, { windowSize, conSize, pad }) => {
			const clampedX = R.clamp(-pad.left, Math.max(pad.left, conSize.x - Math.floor(windowSize.x)- pad.left + 1), pos.x - pad.left)
			const clampedY = R.clamp(-pad.top, Math.max(pad.top, conSize.y - Math.floor(windowSize.y)- pad.top + 1), pos.y - pad.top)


			return {
				windowSize,
				conSize,
				pos: {
					atMinX: pos.atMinX,
					atMaxX: pos.atMaxX,
					atMinY: pos.atMinY,
					atMaxY: pos.atMaxY,
					x: clampedX,
					y: clampedY,
				},
				o: {
					x:  pos.x - pad.left - clampedX,
					y:  pos.y - pad.top - clampedY,
				}
			}
		}),
		combine({ pos: scrollPosition, windowSize: scrollWindowSize, conSize: paddedContentSize, o: browserChromeOverscroll, pad: scrollPadding }, {
			pos: true,
			o: true,
		}),
	);

	return {
		get allowOverscroll() {
			return allowOverscroll
		},
		get adjustedScrollPosition() {
			return adjustedScrollPosition
		},
		get paddedContentSize() {
			return paddedContentSize
		},
		get scrollPosition() {
			return scrollPosition
		},
		get scrollWindowSize() {
			return scrollWindowSize
		},
	}

}