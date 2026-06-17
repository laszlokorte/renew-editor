<script>
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import * as env from '../envvars';
	import { applyLookAndFeel, loadLookAndFeel } from '$lib/api/look_and_feel.js';

	const appTitle = env.APP_NAME;

	const { data, children } = $props();

	onMount(() => {
		applyLookAndFeel(loadLookAndFeel());

		if (dev && 'serviceWorker' in navigator) {
			navigator.serviceWorker.getRegistrations().then(async (registrations) => {
				await Promise.all(registrations.map((registration) => registration.unregister()));

				if (
					navigator.serviceWorker.controller &&
					!sessionStorage.getItem('petristation-sw-dev-reload')
				) {
					sessionStorage.setItem('petristation-sw-dev-reload', '1');
					window.location.reload();
				} else if (!navigator.serviceWorker.controller) {
					sessionStorage.removeItem('petristation-sw-dev-reload');
				}
			});
		} else if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((error) => {
				console.warn('Service worker registration failed', error);
			});
		}

		function handleOffline() {
			data.connectionState.value = false;
		}

		function handleOnline() {
			data.connectionState.value = undefined;
			data.authState.reconnectSocket();
		}

		if (navigator.onLine === false) {
			handleOffline();
		}

		window.addEventListener('offline', handleOffline);
		window.addEventListener('online', handleOnline);

		return () => {
			window.removeEventListener('offline', handleOffline);
			window.removeEventListener('online', handleOnline);
		};
	});
</script>

<svelte:head>
	<title>{appTitle}</title>
</svelte:head>

{@render children()}

<style>
	:global(html[data-petristation-look='renew-classic'] .header) {
		background: #2a8c5f;
	}

	:global(html[data-petristation-look='renew-classic'] .body),
	:global(html[data-petristation-look='renew-classic'] .simulation-workspace) {
		background: #dcefee;
	}

	:global(html[data-petristation-look='renew-classic'] .toolbar),
	:global(html[data-petristation-look='renew-classic'] .menu-bar-menu) {
		background: #f3f3f3;
		color: #000;
	}

	:global(html[data-petristation-look='renew-classic'] .topbar) {
		background: #f7f7f7;
	}

	:global(html[data-petristation-look='high-contrast'] .header) {
		background: #000;
		color: #fff;
	}

	:global(html[data-petristation-look='high-contrast'] .body),
	:global(html[data-petristation-look='high-contrast'] .simulation-workspace) {
		background: #fff;
	}

	:global(html[data-petristation-look='high-contrast'] .toolbar),
	:global(html[data-petristation-look='high-contrast'] .menu-bar-menu),
	:global(html[data-petristation-look='high-contrast'] .topbar) {
		background: #fff;
		color: #000;
		border-color: #000;
	}
</style>
