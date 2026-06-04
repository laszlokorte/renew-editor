<script>
	import { on } from 'svelte/events';
	const {
		className = null,
		disabled = false,
		onclick = null,
		children = null,
		shortcut = null,
		style = null
	} = $props();

	const isMac = navigator.userAgent.indexOf('Mac') != -1;
	function normalize(short) {
		return (
			short && {
				key: short.key,
				shiftKey: short.shiftKey ? true : false,
				altKey: short.altKey ? true : false,
				metaKey: isMac ? short.ctrlKey : false,
				ctrlKey: !isMac ? short.ctrlKey : false
			}
		);
	}

	function shortcutKeyLabel(key) {
		if (!key) {
			return '';
		}

		const labels = {
			Backspace: 'Backspace',
			Delete: 'Entf',
			Escape: 'Esc',
			Enter: 'Enter',
			' ': 'Leertaste'
		};

		if (labels[key]) {
			return labels[key];
		}

		return key.length === 1 ? key.toUpperCase() : key;
	}

	function formatShortcut(short) {
		if (!short) {
			return '';
		}

		const modifiers = [
			short.ctrlKey || short.metaKey ? (short.metaKey ? 'Cmd' : 'Strg') : false,
			short.shiftKey ? 'Umschalt' : false,
			short.altKey ? 'Alt' : false
		].filter(Boolean);
		const key = shortcutKeyLabel(short.key);

		return modifiers.length ? `${modifiers.join('+')}-${key}` : key;
	}

	const normalizedShortcut = normalize(shortcut);
	let shortcutLabel = $derived(formatShortcut(normalizedShortcut));
	let btn = null;
	$effect(() => {
		if (normalizedShortcut) {
			return on(document, 'keydown', (evt) => {
				const el = document.activeElement;
				const isFormControl =
					el &&
					(el.tagName === 'INPUT' ||
						el.tagName === 'TEXTAREA' ||
						el.tagName === 'SELECT' ||
						el.isContentEditable);

				if (isFormControl) {
					return;
				}
				const keys = Object.entries(normalizedShortcut);
				const matches = keys.length && keys.every(([k, v]) => evt[k] === v);
				if (matches) {
					evt.preventDefault();
					btn.click();
				}
			});
		}
	});
</script>

<button
	bind:this={btn}
	class={[className, 'menu-bar-item-button']}
	disabled={disabled || false}
	{style}
	{onclick}
	>{@render children()}
	{#if shortcutLabel}
		<span class="shortcut">{shortcutLabel}</span>
	{/if}</button
>

<style>
	.shortcut {
		margin-left: 3em;
		color: #5872a6;
		font-size: 0.9em;
		font-weight: 400;
		white-space: nowrap;
	}

	.menu-bar-item-button {
		text-align: left;
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		flex-grow: 1;
		width: 100%;
		box-sizing: border-box;
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
		color: #8a8a8a;
		cursor: default;
	}

	.menu-bar-item-button:disabled .shortcut {
		color: #8a8a8a;
	}
</style>
