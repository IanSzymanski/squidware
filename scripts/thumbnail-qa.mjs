import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardware, fingerprint } from './performance-common.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || path.join(root, '.qa/thumbnails', baseline ? 'before' : 'after'));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'profile-'));
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(output, 'fixture.cjs');
await esbuild.build({ stdin: { contents: `
  import { createPerformanceFixture } from './src/performanceFixtures';
  import { serializeProject } from './src/domain';
  const project = createPerformanceFixture('maximum');
  project.sections.push({ id: '72bcf837-68b4-4000-8000-000000000063', name: 'Unused', color: '#aaaaaa' });
  export const content = serializeProject(project);
`, resolveDir: root, loader: 'ts' }, bundle: true, outfile: bundle, platform: 'node', format: 'cjs', logLevel: 'silent' });
const fixture = path.join(output, 'maximum.squid'); await fs.writeFile(fixture, require(bundle).content);
const manifest = path.join(output, 'manifest.json');
await fs.writeFile(manifest, JSON.stringify({ root, output, profile, fixture, baseline, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), hardware: hardware(), buildSha256: await fingerprint(path.join(root, 'dist')) }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
const child = spawn(require('electron'), [path.join(root, 'scripts/thumbnail-qa-runner.cjs'), `--thumbnail-manifest=${manifest}`], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
const timeout = setTimeout(() => child.kill(), 180000);
try { await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Thumbnail QA exited with ${code}.`))); }); } finally { clearTimeout(timeout); }

