// Bundles the TypeScript show generator with the app's own geometry, codec and analysis, then runs it.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const outfile = path.join(root, 'node_modules/.cache/demo-show/generate.mjs');
await esbuild.build({ entryPoints: [path.join(root, 'scripts/demo-show/generate.ts')], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning' });
await import(pathToFileURL(outfile).href);
