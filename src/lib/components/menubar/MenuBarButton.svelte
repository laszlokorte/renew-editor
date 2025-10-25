<script>
	import { on } from 'svelte/events';
	const {
		className = null,
		disabled = false,
		onclick = null,
		children = null,
		shortcut = null
	} = $props();

	const isMac = navigator.userAgent.indexOf('Mac') != -1;
	function normalize(short) {
		return (
			short && {
				key: short.key,
				shiftKey: short.shiftKey ? true : false,
				metaKey: isMac ? short.ctrlKey : false,
				ctrlKey: !isMac ? short.ctrlKey : false
			}
		);
	}

	const normalizedShortcut = normalize(shortcut);
	let shortcutLabel = $derived(
		[
			normalizedShortcut?.ctrlKey || normalizedShortcut?.metaKey ? 'ctrl' : false,
			normalizedShortcut?.shiftKey ? 'shift' : false,
			normalizedShortcut?.altKey ? 'alt' : false,
			normalizedShortcut?.key ?? false
		]
			.filter((x) => x)
			.join(' + ')
	);
	let btn = null;
	$effect(() => {
		if (normalizedShortcut) {
			return on(document, 'keydown', (evt) => {
				const keys = Object.entries(normalizedShortcut);
				const matches = keys.length && keys.every(([k, v]) => evt[k] === v);
				if (matches) {
					evt.preventDefault();
					btn.click();
				} else {
					console.log(evt);
				}
			});
		}
	});
</script>

<button
	bind:this={btn}
	class={[className, 'menu-bar-item-button']}
	disabled={disabled || false}
	{onclick}>{@render children()} <kbd>{shortcutLabel}</kbd></button
>

<style>
	.menu-bar-item-button {
		text-align: left;
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		flex-grow: 1;
		padding: 1ex 1ex 1ex 1ex;
		gap: 3em;
		display: flex;
		justify-content: space-between;
	}
	.menu-bar-item-button:hover {
		background: #eee;
	}

	.menu-bar-item-button:not(:disabled):active {
		background: #e0e0e0;
	}

	.menu-bar-item-button:disabled {
		opacity: 0.3;
		cursor: default;
	}
</style>
