<script>
	import { atom } from '$lib/reactivity/atom.svelte.js';
	import { constructLenses } from '$lib/components/camera/live_lenses';
	const { children, camera, onDrop, dragging = atom(0), onDropFile } = $props();

	const domElement = atom(undefined);
	const lenses = constructLenses(domElement, camera);

	const onDragOver = (evt) => {
		if (evt.dataTransfer.items.length < 1) {
			dragging.value = 0;
			return;
		}
		evt.preventDefault();
		evt.dataTransfer.dropEffect = 'copy';
	};

	const onDragEnter = (evt) => {
		if (evt.dataTransfer.items.length < 1) {
			return;
		}
		evt.preventDefault();
		dragging.value++;
	};

	const onDragLeave = (evt) => {
		if (evt.dataTransfer.items.length < 1) {
			dragging.value = 0;
			return;
		}
		evt.preventDefault();
		dragging.value--;
	};

	const onDragDrop = (evt) => {
		evt.preventDefault();
		const position = lenses.clientToCanvas(evt.clientX, evt.clientY);

		dragging.value = 0;

		// Work-around for
		// https://bugs.chromium.org/p/chromium/issues/detail?id=1293803&no_tracker_redirect=1
		// chrome on android supports only text/plain mimeTypes in drag drop data transfer
		let useWorkaround = true;

		for (let item of evt.dataTransfer.items) {
			if (useWorkaround !== true && item.type && item.type !== 'text/plain') {
				useWorkaround = false;
				item.getAsString((s) => {
					onDrop(item.type, JSON.parse(s), position);
				});
			} else if (item.type === 'text/plain') {
				if (useWorkaround !== false) {
					useWorkaround = true;

					item.getAsString((s) => {
						const n = JSON.parse(s);

						const mime = n.mime;
						const data = n.data;

						onDrop(mime, data, position);
					});
				}
			} else if (useWorkaround !== true && item.kind === 'string') {
				alert(item.type);
				item.getAsString((s) => {
					alert('dropped: ' + s);
				});
			} else if (item.kind === 'file') {
				if (onDropFile) {
					onDropFile(item.getAsFile(), position);
				}
			}
		}
	};
</script>

<div
	class="drop-zone"
	role="application"
	pointer-events="all"
	ondragover={onDragOver}
	ondragenter={onDragEnter}
	ondragleave={onDragLeave}
	ondrop={onDragDrop}
	class:active={dragging.value > 0}
	bind:this={domElement.value}
>
	{@render children()}
	<div
		class="blocker"
		class:active={dragging.value > 0}
		ondragenter={onDragEnter}
		ondragleave={onDragLeave}
		role="application"
	></div>
</div>

<style>
	.drop-zone {
		display: grid;
		position: relative;
		min-width: max-content;
		min-height: max-content;
		align-self: stretch;
		justify-self: stretch;
	}

	.drop-zone.active {
		outline: 0.5em solid #22ee88;
	}

	.blocker {
		position: absolute;
		inset: 0;
		color: #22ee88;
		padding: 1em;
		font-size: 2em;
		display: none;
		font-family: sans-serif;
		pointer-events: none;
	}

	.blocker.active {
		display: grid;
		pointer-events: all;
		touch-action: none;
	}
</style>
