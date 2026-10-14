// Bundle the exact renderer codec for native validation; no second format implementation.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ entryPoints: [path.join(root, 'src/projectV2.ts')], outfile: path.join(root, 'electron/project-codec.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent' });
await esbuild.build({ entryPoints: [path.join(root, 'src/preferences.ts')], outfile: path.join(root, 'electron/preferences-codec.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent' });
