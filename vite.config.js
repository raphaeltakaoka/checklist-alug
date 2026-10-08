import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		// Keep the project's $lib imports with an explicit Vite alias in SvelteKit 3.
		alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			compilerOptions: {
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			version: {
				pollInterval: 300000 // Poll every 5 minutes in production
			}
		})
	]
});
