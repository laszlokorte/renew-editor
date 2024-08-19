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
</script>

<div
	class="scroller"
	class:overscroll-enabled={model.allowOverscroll}
	class:overscroll-disabled={!model.allowOverscroll}
	use:bindScroll={model.adjustedScrollPosition}
	style:--scroll-total-x={model.paddedContentSize.x}
	style:--scroll-total-y={model.paddedContentSize.y}
	style:--scroll-x={model.scrollPosition.x}
	style:--scroll-y={model.scrollPosition.y}
>
	<div class="scroller-body">
		{@render children()}
	</div>
	<div class="scroller-measure" use:bindSize={model.scrollWindowSize}></div>
</div>
<style>
	.scroller {
		contain: strict;
		border: 3px solid #333;
		min-height: 10em;
		resize: both;
		overflow: scroll;
		height: 30em;
		position: relative;
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 1fr;
		touch-action: manipulation;
		-webkit-touch-callout: none;
        -webkit-user-callout: none;
        -webkit-user-select: none;
        -webkit-user-drag: none;
        -webkit-user-modify: none;
        -webkit-highlight: none;
		user-select: none;
		scroll-behavior: smooth;
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
		-webkit-user-select: none;
		user-select: none;
		touch-action: manipulation;
	}
</style>
