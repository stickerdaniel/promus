// Vite reads all SDK .ts files at build time as raw strings.
// This makes them available in serverless environments (Vercel) where
// runtime filesystem access to docs/ is not possible.
const rawFiles = import.meta.glob('/docs/references/unipile-node-sdk/src/**/*.ts', {
	query: '?raw',
	eager: true,
	import: 'default'
}) as Record<string, string>;

const PREFIX = '/docs/references/unipile-node-sdk/src';

export const sdkFiles: Record<string, string> = {};
for (const [path, content] of Object.entries(rawFiles)) {
	sdkFiles[path.slice(PREFIX.length)] = content;
}
