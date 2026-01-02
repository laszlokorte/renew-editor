<script>
	import * as L from 'partial.lenses';
	import { view, combine } from '$lib/reactivity/atom.svelte';
	import { bindValue } from '$lib/reactivity/bindings.svelte';
	const { cast, cmd, type, attr, path, singleSelectedLayer, optimisticValue } = $props();
	const optimisticLens = (id, attr, persistentLens) => {
		return L.lens(
			(store) =>
				store && store.optimistic && store.optimistic.id === id && store.optimistic.attr === attr
					? store.optimistic.value
					: L.get(persistentLens, store.real),
			(newValue, { optimistic, real }) => ({
				optimistic: newValue === undefined ? undefined : { id, attr, value: newValue },
				real: newValue === undefined ? real : L.set(persistentLens, newValue, real)
			})
		);
	};
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

	const optimistic = view(
		optimisticLens(singleSelectedLayer.value.id, path.join('__'), path),
		combine(
			{ optimistic: optimisticValue, real: singleSelectedLayer },
			{ optimistic: true, real: true }
		)
	);
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
