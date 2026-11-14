import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { visualizer } from 'rollup-plugin-visualizer';
import type { PluginOption } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: vitePreprocess(),
			// SvelteKit 3 replaced `$lib` with `#lib`; the alias keeps the existing imports.
			alias: {
				$lib: 'src/lib',
				$blocks: 'src/blocks'
			},
			experimental: {
				remoteFunctions: true
			}
		}),
		devtoolsJson(),
		// Bundle analyzer
		visualizer({
			emitFile: true,
			filename: 'stats.html',
			template: 'treemap',
			gzipSize: true,
			brotliSize: true
		}) as PluginOption
	] as any,
	resolve: {
		conditions: ['browser']
	},
	test: {
		exclude: [
			'e2e/**',
			'**/node_modules/**',
			'dist/**',
			'.{idea,git,cache,output,temp}/**',
			'docs/**',
			'.opencode/**',
			'references/**'
		],
		passWithNoTests: true,
		environment: 'jsdom'
	},
	optimizeDeps: {
		include: ['svelte-konva', 'konva']
	},
	ssr: {
		noExternal: ['svelte-konva']
	}
});
