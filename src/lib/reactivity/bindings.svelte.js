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


export function bindBoundingBox(node, someAtom) {
	let oldV
	$effect.pre(() => {
		tick().then(() => {
			const bbox = node.getBBox();
			if(bbox.width || bbox.height) {
				oldV = {x:bbox.x, y:bbox.y, width: bbox.width, height: bbox.height}
				someAtom.value = oldV
			} else {
				oldV = undefined
				someAtom.value = undefined
			}
		})
	})

	const observer = new MutationObserver(function(mutations) {
	  	const bbox = node.getBBox();
		if(bbox.width || bbox.height) {
			oldV = {x:Math.round(bbox.x), y:Math.round(bbox.y), width: Math.round(bbox.width), height: Math.round(bbox.height)}
			someAtom.value = oldV
		} else {
			oldV = undefined
			someAtom.value = undefined
		}
	});

	observer.observe(node, {
	  attributes: true 
	});

	return {
		update(newAtom) {
			someAtom = newAtom
		},
		destroy() {
			observer.disconnect(node);
			someAtom.value = undefined
		}
	}
}


export function bindValue(node, someAtom) {
	let c0 = null;
	let c1 = null;
	function oninput(e) {
		const before = someAtom.value;
		someAtom.value = node.value;
		node.value = someAtom.value;
		const newVal = someAtom.value;
		if(node.value != newVal) {	
			node.value = newVal;
		}
		if(c0 !== null && someAtom.value == before) {
			node.selectionStart = c0
			node.selectionEnd = c1
		}
	}

	function onbeforeinput(e) {
		c0 = node.selectionStart
		c1 = node.selectionEnd
	}

	node.value = someAtom.value;

	$effect.pre(() => {
		const newVal = someAtom.value;

		untrack(() => {
			if(node.value !== newVal) {	
				tick().then(() => {
					node.value = newVal;
				})
			}
		})
	});

	// $effect(() => {
	// 	node.value = someAtom.value;
	// });

	node.addEventListener("input", oninput);
	node.addEventListener("change", oninput);
	try {
		let x = node.selectionStart;
		node.addEventListener("beforeinput", onbeforeinput);
	} catch(e) {

	}

	return {
		update(newAtom) {
			someAtom = newAtom
			node.value = someAtom.value;

			$effect(() => {
				const newVal = someAtom.value;

				untrack(() => {
					if(node.value !== newVal) {	
						tick().then(() => {
							node.value = newVal;
						})
					}
				})
			});
		},
		destroy() {
			node.removeEventListener("beforeinput", onbeforeinput);
			node.removeEventListener("input", oninput);
			node.removeEventListener("change", oninput);
		}
	};
}

export function readScroll(node, someAtom) {
	 const onScrollThrottled = throttled(function onscroll(e) {
	 	const newValue = someAtom.value
		const nodeScrollLeft = node.scrollLeft
		const nodeScrollTop = node.scrollTop
	 	if(newValue.x != nodeScrollLeft || newValue.y != nodeScrollTop) {
			someAtom.value = {
				x: nodeScrollLeft,
				y: nodeScrollTop,
			}
	 	}
	})

	node.addEventListener("scroll", onScrollThrottled, { passive: true });

	return () => {
		node.removeEventListener("scroll", onScrollThrottled, { passive: true });
	};
}

export function bindScrollMax(node, someAtom) {
	// TODO specialize code for different kind of elements
	const resizeObserver = new ResizeObserver(() => {
		someAtom.value = {
			x: node.scrollWidth - node.clientWidth,
			y: node.scrollHeight - node.clientHeight,
		}
	});

	const mutObserver = new MutationObserver(() => {
		someAtom.value = {
			x: node.scrollWidth - node.clientWidth,
			y: node.scrollHeight - node.clientHeight,
		}
	});

	const onInput = (evt) => {
		if(evt.currentTarget !== node) {
			return
		}
		someAtom.value = {
			x: node.scrollWidth - node.clientWidth,
			y: node.scrollHeight - node.clientHeight,
		}
	}

	resizeObserver.observe(node)
	mutObserver.observe(node, { attributes: true, childList: false, subtree: true, characterData: true, })
	node.addEventListener('input', onInput)

	return () => {
		node.removeEventListener('input', onInput)
		mutObserver.unobserve(node)
		resizeObserver.unobserve(node)
	};
}


export function readTextreaScrollSize(node, someAtom) {
	function oninput(e) {
		someAtom.value = {
			x: node.scrollWidth,
			y: node.scrollHeight,
		}
	}

	node.addEventListener("input", oninput);

	return () => {
		node.removeEventListener("input", oninput);
	};
}

export function activeEvent(node, {eventType, fn}) {
    node.addEventListener(eventType, fn, { passive: false });

    return {
        destroy() {
            node.removeEventListener(eventType, fn, { passive: false });
        },
    };
};


export function activeTouchMove(node, fn) {
    return activeEvent(node, {eventType: 'touchmove', fn})
};

export function disableTouchEventsIf(node, atom) {
	return activeTouchMove(node, (evt) => {
		if (atom.value) {
			evt.preventDefault();
		}
	})
}

export function disableEventIf(node, {eventType, cond}) {
	return activeEvent(node, {eventType, fn: (evt) => {
		if (cond === true || (cond !== false && cond.value)) {
			evt.preventDefault();
		}
	}})
}

export function onPointerClick(node, fn) {
	let wasDown = false
	const onDown = (evt) => {
		evt.stopPropagation()
		evt.stopImmediatePropagation()
		wasDown = true
	}
	const onEnd = (evt) => {
		wasDown = false
	}
	const onClick = (evt) => {
		if(wasDown) {
			fn(evt)
			wasDown = false
		}
	}

	node.addEventListener('pointerdown', onDown)
	node.addEventListener('click', onClick)
	node.addEventListener('onpointercancel', onEnd)

	return () => {
		node.removeEventListener('onpointercancel', onEnd)
		node.removeEventListener('click', onClick)
		node.removeEventListener('pointerdown', onDown)
	}
}

export function isFullscreen() {
	let isFull = $state(document.fullscreenElement !== null)

	function updateFullScreenState() {
		isFull = document.fullscreenElement !== null
	}

	$effect(() => {
		document.addEventListener("fullscreenchange", updateFullScreenState, false);  
		return () => {
			document.removeEventListener("fullscreenchange", updateFullScreenState, false); 
		}
	})

	return {
		get value() {
			return isFull
		}
	}
}