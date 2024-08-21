import * as L from 'partial.lenses'
import * as R from "ramda";

export function storedAtom(id) {
	let root = $state.raw({value: localStorage.getItem(id)})

	function onChange(evt) {
		if(evt.key === id) {
			root = {
				value: evt.newValue
			}
		}
	}

	$effect(() => {
		window.addEventListener('storage', onChange);

		return () => {
			window.removeEventListener('storage', onChange)
		}
	})

	return {
		get value() {
			return root.value
		},
		set value(newVal) {
			root = {
				value: newVal
			}
			localStorage.setItem(id, newVal)
		}
	}
}


export function atom(init) {
	let root = $state.raw({
		value: init
	})

	return {
		get value() {
			return root.value
		},
		set value(newVal) {
			root = {
				value: newVal
			}
		}
	}
}

export function combine(mapOfAtoms, writables = null) {
	if(writables === null) {

		writables = R.mapObjIndexed((v, k) => {
			return (typeof Object.getOwnPropertyDescriptor(v, 'value').set === 'function')
		}, mapOfAtoms)
	}

	return {
		get value() {
			return R.map((v) => {
				const s = v.value;

				return s
			}, mapOfAtoms)
		},
		set value(newVal) {
			const oldValues = R.map((v) => {
				return (v.value)
			}, mapOfAtoms)

			R.forEachObjIndexed((v, k) => {
				if(writables[k] && !$state.is(oldValues[k], newVal[k])) {
					v.value = newVal[k]
				}
			}, mapOfAtoms)
		}
	}
}

export function combineWithRest(mapOfAtoms, rest = atom({}), writables = null) {
	if(writables === null) {

		writables = R.mapObjIndexed((v, k) => {
			return (typeof Object.getOwnPropertyDescriptor(v, 'value').set === 'function')
		}, mapOfAtoms)
	};

	return {
		get value() {
			return {
				...rest.value,
				...R.map((v) => v.value, mapOfAtoms)
			}
		},
		set value(newVal) {
			const oldValues = R.map((v) => {
				return (v.value)
			}, mapOfAtoms)

			R.forEachObjIndexed((v, k) => {
				if(writables[k] && !$state.is(oldValues[k], newVal[k])) {
					v.value = newVal[k]
				}
			}, mapOfAtoms)
			rest.value = R.pick(R.difference(Object.keys(newVal), Object.keys(mapOfAtoms)), newVal)
		}
	}
}

export function combineArray(listOfAtoms) {
	return {
		get value() {
			return R.map((v) => {
				const s = (v.value);

				return s
			}, listOfAtoms)
		},
		set value(newVal) {
			const oldValues = R.map((v) => {
				return (v.value)
			}, listOfAtoms)

			R.addIndex(R.forEach)((v, i) => {
				if(!$state.is(oldValues[i], newVal[i])) {
					v.value = newVal[i]
				}
			}, listOfAtoms)
		}
	}
}

export function view(opticLense, someAtom) {
	const cachedOriginal = $derived(someAtom.value)
	const cached = $derived(L.get(opticLense, cachedOriginal))

	return {
		get value() {
			return cached
		},
		set value(newVal) {
			const transformed = L.set(opticLense, newVal, cachedOriginal)

			if (!(transformed instanceof Error)) {
				someAtom.value = transformed
			}
		},
	}
}

export function strictView(opticLense, someAtom) {
	return {
		get value() {
			return L.get(opticLense, someAtom.value)
		},
		set value(newVal) {
			const transformed = L.set(opticLense, newVal, someAtom.value)

			if (!(transformed instanceof Error)) {
				someAtom.value = transformed
			} else {
				someAtom.value = someAtom.value
			}
		},
	}
}

export function mutableView(init, someAtom, equality = R.equals) {
	let original = $state(someAtom.value)
	let mutable = $state(init(original, undefined))

	$effect(() => {
		const newValue = someAtom.value

		untrack(() => {
			if(!equality(newValue, original)) {
				original = newValue
				mutable = init(newValue, mutable)
			}
		})
	})

	return {
		get value() {
			return mutable
		},
		set value(newVal) {
			const transformed = newVal

			if (!(transformed instanceof Error)) {
				mutable = transformed
			}
		},
	}
}

export function update(fn, someAtom) {
	someAtom.value = fn(someAtom.value)
}


export function toggle(someAtom, fn) {
	let prev = null

	$effect(() => {
		const currentValue = someAtom.value
		const next = !!currentValue

		if(next !== prev) {
			prev = next

			fn(currentValue)
		}
	})
}

export function during(someAtom, fn) {
	let raf = null

	toggle(someAtom, (val) => {
		if (val) {
			function tick() {
				fn(someAtom.value)
				raf = requestAnimationFrame(tick)
			}

			tick()
		} else {
			cancelAnimationFrame(raf)
			raf = null
		}
	})
}

export function animateWith(someAtom, fn) {
	let raf = null

	$effect(() => {
		const currentVal = someAtom.value
		const restore = (event) => {
			fn(currentVal)
		}
		if(currentVal) {
			currentVal.el.addEventListener("contextrestored", restore);
			function tick() {
				const currentVal = someAtom.value
				if(currentVal) {
					fn(currentVal)
					raf = requestAnimationFrame(tick)
				}
			}

			tick()

			return () => {
				currentVal.el.removeEventListener("contextrestored", restore);
			}
		} else if(raf) {
			cancelAnimationFrame(raf)
			raf = null
		}
	})
}


export function failableView(opticLense, someAtom, autoReset = true, errorAtom = atom(null), transientAtom = atom(null)) {
	$effect(() => {
		const changed = someAtom.value

		untrack(() => {
			errorAtom.value = null
			transientAtom.value = null
		})
	})

	return {
		get value() {
			return !$state.is(errorAtom.value, null) ? transientAtom.value : L.get(opticLense, someAtom.value)
		},
		set value(newVal) {
			const transformed = L.set(opticLense, newVal, someAtom.value)


			if (!(transformed instanceof Error)) {
				someAtom.value = transformed
				transientAtom.value = null
				errorAtom.value = null
			} else {
				transientAtom.value = newVal
				errorAtom.value = transformed
			}
		},
		get stableValue() {
			return L.get(opticLense, someAtom.value)
		},
		set stableValue(newVal) {
			const transformed = L.set(opticLense, newVal, someAtom.value)

			if (!(transformed instanceof Error)) {
				someAtom.value = transformed

				if(autoReset) {
					transientAtom.value = null
					errorAtom.value = null
				}
			}
		},

		get stableAtom() {
			return {
				get value() {
					return L.get(opticLense, someAtom.value)
				},
				set value(newVal) {
					const transformed = L.set(opticLense, newVal, someAtom.value)

					if (!(transformed instanceof Error)) {
						someAtom.value = transformed
						if(autoReset) {
							transientAtom.value = null
							errorAtom.value = null
						}
					}
				}
			}
		},

		get error() {
			return errorAtom.value
		},
		get hasError() {
			return errorAtom.value !== null
		},
		reset() {
			transientAtom.value = null
			errorAtom.value = null
		}
	}
}

export function read(opticLense, someAtom) {
	const cached = $derived(L.get(opticLense, someAtom.value))

	return {
		get value() {
			return cached
		},

		get all() {
			return L.collect(opticLense, someAtom.value)
		},

		get allUniq() {
			return [...L.foldl((a, b) => {
				a.add(b)

				return a
			}, new Set(), opticLense, someAtom.value)]
		},

		get max() {
			return L.foldl((a,b) => b===undefined?a:Math.max(a,b), -Infinity, opticLense, someAtom.value)
		},

		get min() {
			return L.foldl((a,b) => b===undefined?a:Math.min(a,b), Infinity, opticLense, someAtom.value)
		},

		folded(fn, init, skipUndefined=true) {
			return L.foldl((a,b) => (skipUndefined && b===undefined) ? a : fn(a,b), init, opticLense, someAtom.value)
		},

		traverse(trav, fn = R.identity) {
			return {
				get value() {
					return fn(trav(opticLense, someAtom.value))
				},
			}
		}
	}
}

export function traverse(opticLense, trav, someAtom) {
	return {
		get value() {
			return fn(trav(opticLense, someAtom.value))
		},

		map(fn) {
			return {
				get value() {
					return fn(trav(opticLense, someAtom.value))
				},
			}
		}
	}
}

export function map(fn, someAtom) {
	return {
		get value() {
			return fn(someAtom.value)
		},
	}
}

export function string(parts, ...args) {
	return {
		get value() {
			return R.join('', R.zipWith(R.concat, parts, R.map(R.compose(x=>""+x, R.prop('value')), args))) + R.last(parts)
		},
	}
}



export function delayedRead(lens, someAtom) {
	const later = atom(L.get(lens, someAtom.value));

	$effect.pre(() => {
		later.value = L.get(lens, someAtom.value);
		tick().then(() => {
			later.value = L.get(lens, someAtom.value);
		});
	});

	return read(L.identity, later);
}

export function delayed(lens, someAtom) {
	const later = atom(L.get(lens, someAtom.value));

	$effect.pre(() => {
		later.value = L.get(lens, someAtom.value);
		tick().then(() => {
			later.value = L.get(lens, someAtom.value);
		});
	});

	$effect.pre(() => {
		someAtom.value = L.set(lens, instant.value, someAtom.value);
		tick().then(() => {
			someAtom.value = L.set(lens, instant.value, someAtom.value);
		});
	});

	return later;
}