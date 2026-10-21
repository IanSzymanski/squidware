import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('audio-clock', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  import {createLegacyPerformanceFixture} from './src/performanceFixtures';
  import {migrateProjectV1} from './src/projectV2';
  export {countToSeconds, secondsToCount, sampleProject, totalCounts} from './src/domain';
  export function fixture(counts=1024) {
    const p=createLegacyPerformanceFixture('demo');
    p.title='Audio-clock rehearsal';
    p.sets.forEach((s,i)=>{s.counts=i ? counts : 0; s.tempo=i===2 ? 96 : 120;});
    return migrateProjectV1(p);
  }
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
// Deterministic 10-minute, mono PCM recording with a short audible pulse each
// second. No user recording, hardware microphone or network is needed.
async function wav(name, seconds) {
  const rate = 8000, samples = rate * seconds, bytes = samples * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF'); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples; i++) if (i % rate < rate / 10) buffer.writeInt16LE(Math.round(1000 * Math.sin(i / rate * Math.PI * 880)), 44 + i * 2);
  const file = path.join(qa.output, name); await fs.writeFile(file, buffer); return file;
}
const recording = await wav('ten-minute-pulses.wav', 600), shortRecording = await wav('short-pulses.wav', 3);
await qa.run('audio-clock-qa-runner.cjs', 'audio-clock-manifest', { bundle, recording, shortRecording });
