import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig({
	plugins: [devtoolsJson(), sveltekit()],
	server: {
		warmup: {
			clientFiles: [
				'src/routes/AppBar.svelte',
				'src/routes/documents/\\[document_id\\]/\\+layout.js',
				'src/routes/documents/\\[document_id\\]/editor/\\+page.svelte'
			]
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
