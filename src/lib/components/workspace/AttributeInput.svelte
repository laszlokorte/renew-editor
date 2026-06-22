<script>
	import * as L from 'partial.lenses';
	import { bindValue } from '$lib/reactivity/bindings.svelte';
	const { cast, cmd, type, attr, path, singleSelectedLayer, optimisticValue } = $props();
	function debounce(callback, delay) {
		let timer;

		return function (...args) {
			clearTimeout(timer);
			timer = setTimeout(() => {
				callback(...args);
			}, delay);
		};
	}
	const debouncedCast = debounce(cast, 100);
	const optimisticAttr = path.join('__');

	const optimistic = {
		get value() {
			const currentLayerId = singleSelectedLayer.value.id;
			const optimistic = optimisticValue.value;

			return optimistic && optimistic.id === currentLayerId && optimistic.attr === optimisticAttr
				? optimistic.value
				: L.get(path, singleSelectedLayer.value);
		},
		set value(newValue) {
			const currentLayerId = singleSelectedLayer.value.id;
			optimisticValue.value =
				newValue === undefined
					? undefined
					: { id: currentLayerId, attr: optimisticAttr, value: newValue };
		}
	};
</script>

{#key singleSelectedLayer.value.id}
	<input
		type="number"
		class="pretty-number-control"
		size="4"
		min="1"
		max="128"
		onblur={(evt) => {
			optimistic.value = undefined;
		}}
		oninput={(evt) => {
			const _newVal = evt.currentTarget.value;
			const _id = singleSelectedLayer.value.id;
			debouncedCast(cmd, {
				layer_id: _id,
				type,
				attr,
				val: _newVal
			});
		}}
		use:bindValue={optimistic}
	/>
{/key}

<style>
	.pretty-number-control {
		display: block;
		grid-area: value / full;
		width: 100%;
		background: #fafafa;
		padding: 0.5ex;
		border: 1px solid #e0e0e0;
		box-sizing: border-box;
		min-width: 6em;
	}
</style>
