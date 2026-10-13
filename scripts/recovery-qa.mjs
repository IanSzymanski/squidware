// Real desktop recovery across two process launches, using only an isolated profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardware, fingerprint } from './performance-common.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || path.join(root, '.qa/recovery'));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'profile-'));
const bundle = path.join(output, 'fixture.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createPerformanceFixture } from './src/performanceFixtures';
  import { serializeProject } from './src/domain';
  const project = createPerformanceFixture('maximum'); project.title = 'Maximum recovery QA';
  project.sets.forEach(set => { set.notes = 'N'.repeat(10000); Object.values(set.positions).forEach(point => { point.x += 0.123456789; point.y += 0.123456789; }); });
  export const content = serializeProject(project);
`, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const content = require(bundle).content;
if (Buffer.byteLength(content) <= 5 * 1024 * 1024) throw new Error('Recovery fixture must exceed typical legacy localStorage quota.');
const fixtureFile = path.join(output, 'maximum.squid'); await fs.writeFile(fixtureFile, content);
const manifest = path.join(output, 'manifest.json');
await fs.writeFile(manifest, JSON.stringify({ root, output, profile, fixtureFile, fixtureBytes: Buffer.byteLength(content), hardware: hardware(), buildSha256: await fingerprint(path.join(root, 'dist')) }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
for (const phase of ['write', 'restart']) {
  const args = [path.join(root, 'scripts/recovery-qa-runner.cjs'), `--recovery-manifest=${manifest}`, `--phase=${phase}`];
  const child = spawn(require('electron'), args, { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 150000);
  try { await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Recovery QA ${phase} exited with ${code}.`))); }); }
  finally { clearTimeout(timeout); }
}
