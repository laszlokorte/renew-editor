import * as R from "ramda";
import {tick, untrack} from "svelte";

export function throttled(fn) {
	let ticking = false;

	return (...args) => {
		if (!ticking) {
		    window.requestAnimationFrame(() => {
		      fn(...args);
		      ticking = false;
		    });

		    ticking = true;
		}
	}
}

export function bindSize(node, someAtom) {
	const resizeObserver = new ResizeObserver((entries) => {
	  for (const entry of entries) {
	    if (entry.borderBoxSize) {
	    	someAtom.value = {
	    		x: entry.borderBoxSize[0].inlineSize,
	    		y: entry.borderBoxSize[0].blockSize,
	    	}
	    } else {
			someAtom.value = {
				x: entry.contentRect.width,
				y: entry.contentRect.height,
			}
	    }
	  }
	});

	resizeObserver.observe(node)

	return () => {
		resizeObserver.disconnect()
	};
}


export function bindScroll(node, someAtom) {
	 const onScrollThrottled = throttled(function onscroll(e) {

	 	const newValue = someAtom.value
		const nodeScrollLeft = node.scrollLeft
		const nodeScrollTop = node.scrollTop

	 	if((newValue.x !== nodeScrollLeft || newValue.y !== nodeScrollTop)) {

	 		const leftMax = node.scrollLeftMax ?? (node.scrollWidth - node.offsetWidth)
	 		const topMax =  node.scrollTopMax ?? (node.scrollHeight - node.offsetHeight)

			const scrollMaxX = Math.max(0, leftMax)
			const scrollMaxY = Math.max(0, topMax)

			someAtom.value = {
				x: nodeScrollLeft,
				y: nodeScrollTop,
				atMaxX: nodeScrollLeft >= scrollMaxX,
				atMinX: nodeScrollLeft <= 0,
				atMaxY: nodeScrollTop >= scrollMaxY,
				atMinY: nodeScrollTop <= 0,
			}
	 	}
	})


	$effect.pre(() => {
		const newPos = someAtom.value
		tick().then(function bindScrollEffect() {
			const scrollMaxX = Math.max(0, node.scrollLeftMax  ?? node.scrollWidth - node.offsetWidth)
			const scrollMaxY = Math.max(0, node.scrollTopMax  ?? node.scrollHeight - node.offsetHeight)
			const newX =  R.clamp(0, scrollMaxX, newPos.x)
			const newY =  R.clamp(0, scrollMaxY, newPos.y)
			const oldX = R.clamp(0, scrollMaxX, node.scrollLeft)
			const oldY = R.clamp(0, scrollMaxY, node.scrollTop)

			if(oldX != newX || oldY != newY) {
				node.scrollTo({
					left: newX,
					top: newY,
					behavior: "instant",
				})
			}
		})
	});

	node.addEventListener("scroll", onScrollThrottled, { passive: true });

	return () => {
		node.removeEventListener("scroll", onScrollThrottled, { passive: true });
	};
}


export function autofocusIf(node, {focus: yes, select: select = false}) {
	if(yes) {
		if(yes && document.activeElement !== node) {
			node.focus({
			  preventScroll: true
			})
			if(select) {
				node.select();
			}
		} else if(!yes && document.activeElement === node) {
			node.blur()
		}
	}


	return {
		update(yes) {
			if(yes && document.activeElement !== node) {
				node.focus({
				  preventScroll: true
				})
			} else if(!yes && document.activeElement === node) {
				node.blur()
			}
		},

		destroy() {
			// the node has been removed from the DOM
		},
	};
}