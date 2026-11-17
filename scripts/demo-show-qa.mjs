import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';

const qa = await createQa('demo-show', { timeoutMs: 270000 });
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'domain.cjs');
await esbuild.build({ stdin: { contents: `export {parseProject, setStartCount, countToSeconds} from './src/domain';`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
// Test-only silence, long enough to seek every arrival. This is not the Space
// show recording and does not ship with the app or establish music rights.
const rate = 8000, wav = Buffer.alloc(44 + rate * 680 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const recording = path.join(qa.output, 'generated-clock.wav');
await fs.writeFile(recording, wav);
await qa.run('demo-show-qa-runner.cjs', 'demo-show-manifest', { bundle, recording });
