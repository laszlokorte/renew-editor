<script>
	let { visible = $bindable(false), closeLabel = 'Close', children } = $props();

	function onClose(evt) {
		evt.preventDefault();
		visible = false;
	}

	function onEscape(evt) {
		if (evt.key === 'Escape' && visible) {
			evt.preventDefault();
			evt.stopPropagation();
			visible = false;
		}
	}

	$effect(() => {
		window.addEventListener('keydown', onEscape);

		return () => {
			window.removeEventListener('keydown', onEscape);
		};
	});
</script>

<div class="modal-backdrop" class:visible>
	<div
		tabindex="-1"
		role="button"
		class="modal-outside"
		onclick={onClose}
		onkeydown={onClose}
	></div>
	<div class="modal-content">
		<div class="modal-head">
			<button type="reset" class="modal-close" onclick={onClose}>{closeLabel}</button>
		</div>
		<div class="modal-body">
			{#if visible}
				{@render children()}
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		display: none;
		position: fixed;
		place-content: stretch;
		place-items: stretch;
		background: #0003;
		top: 0;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 99000;
	}

	.modal-outside {
		position: absolute;
		inset: 0;
	}

	.modal-backdrop.visible {
		display: grid;
	}

	.modal-content {
		z-index: 10;
		background: #fff;
		padding: 1em;
		display: grid;
		grid-template-rows: auto 1fr;
		align-self: center;
		justify-self: center;

		min-width: 50%;
		margin: 2em;

		align-content: stretch;
		justify-content: stretch;

		box-shadow: 0 0.5em 2em -1em #0004;
	}

	.modal-head {
		display: flex;
		align-items: center;
		justify-content: end;
	}

	.modal-body {
		margin: 1em;
		display: grid;
		place-content: stretch;
		place-items: stretch;
		grid-template-rows: auto;
		grid-auto-rows: auto;
		gap: 1em;
	}

	.modal-close {
		background: none;
		font: inherit;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
	}
</style>
