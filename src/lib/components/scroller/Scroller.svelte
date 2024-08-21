<script>
	import {
		bindScroll,
		bindSize,
	} from "$lib/reactivity/bindings.svelte.js";
	import {
		atom,
	} from "$lib/reactivity/atom.svelte.js";

	const {
		children,
		alignment='left',
		scrollPosition = atom({ x: 0, y: 0 }),
		contentSize = atom({ x: 0, y: 0 }),
		scrollWindowSize = atom({ x: 0, y: 0 }),
		extraScrollPadding = atom(false),
		allowOverscroll = true
	} = $props();

	import viewModel from './viewmodel.js'

	const model = viewModel(alignment, scrollPosition, contentSize, scrollWindowSize, extraScrollPadding, allowOverscroll)

	const modelValues = $derived(model.values)
	const bindings = model.bindings
</script>

<div
	class="scroller"
	class:overscroll-enabled={modelValues.allowOverscroll}
	class:overscroll-disabled={!modelValues.allowOverscroll}
	use:bindScroll={bindings.adjustedScrollPosition}
	style:--scroll-total-x={modelValues.paddedContentSize.x}
	style:--scroll-total-y={modelValues.paddedContentSize.y}
	style:--scroll-x={modelValues.scrollPosition.x}
	style:--scroll-y={modelValues.scrollPosition.y}
>
	<div class="scroller-body">
		{@render children()}
	</div>
	<div class="scroller-measure" use:bindSize={bindings.scrollWindowSize}></div>
</div>
<style>
	.scroller {
		contain: strict;
		min-height: 10em;
		overflow: scroll;
		flex-grow: 1;
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 1fr;
		touch-action: manipulation;
		scroll-behavior: smooth;
		-webkit-touch-callout: none;
        -webkit-user-callout: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        -webkit-user-modify: none;
        -webkit-highlight: none;
		user-select: none;
	}

	.overscroll-enabled {
    	overscroll-behavior: auto;
	}

	.overscroll-disabled {
    	overscroll-behavior: none;
	}

	.scroller > * {
		grid-area: 1 / 1;
	}

	.scroller-measure {
		position: sticky;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		display: block;
		pointer-events: none;
		z-index: 10000;
		place-self: stretch;
		pointer-events: none;
	}

	.scroller::after {
		display: block;
		content: " ";
		height: calc(var(--scroll-total-y, 1) * 1px + 1px);
		width: calc(var(--scroll-total-x, 1) * 1px + 1px);
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
	}

	.scroller-body {
		position: sticky;
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 1fr;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		touch-action: manipulation;
		-webkit-user-select: none;
		user-select: none;
	}
</style>
