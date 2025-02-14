<script>
	// https://discourse.threejs.org/t/iphone-how-to-remove-text-selection-magnifier/47812/7
	function createHandler(func, timeout) {
		let timer = null;
		let pressed = false;

		return function (evt) {
			if (timer) {
				clearTimeout(timer);
			}

			if (pressed && evt.changedTouches.length === 1) {
				if (func) {
					func.apply(this, arguments);
				}
				clear();
			} else if (evt.changedTouches.length === 1) {
				pressed = true;
				setTimeout(clear, timeout || 500);
			}
		};

		function clear() {
			timeout = null;
			pressed = false;
		}
	}

	$effect(() => {
		const ignore = createHandler((e) => {
			e.preventDefault();

			let touch = event.changedTouches[0];

			// Create a new click event with touch coordinates
			let clickEvent = new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				view: window,
				clientX: touch.clientX,
				clientY: touch.clientY
			});

			clickEvent.preventDefault();

			// Dispatch the click event on the touched element
			event.target.dispatchEvent(clickEvent);
		}, 500);

		document.body.addEventListener('touchstart', ignore, { passive: false });

		return () => {
			document.body.removeEventListener('touchstart', ignore, { passive: false });
		};
	});
</script>
