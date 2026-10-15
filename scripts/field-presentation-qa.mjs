import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const output = path.join(root, '.qa', baseline ? 'field-before' : 'field-presentation');
await fs.mkdir(output, { recursive: true });
const bundle = path.join(output, 'fixture.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createLegacyPerformanceFixture } from './src/performanceFixtures';
  import { migrateProjectV1 } from './src/projectV2';
  import { serializeProject } from './src/domain';
  const project = createLegacyPerformanceFixture('maximum');
  project.title = 'Dense two-step block'; project.sets = project.sets.slice(0, 2);
  for (const set of project.sets) {
    set.positions = Object.fromEntries(project.performers.map((p, i) => [p.id, {x:35+i%25*1.25,y:14+Math.floor(i/25)*1.25}]));
    for (const p of project.performers.slice(-2)) set.positions[p.id] = {...set.positions[project.performers[0].id]};
  }
  export const content = serializeProject(migrateProjectV1(project));
`, resolveDir: root, loader: 'ts' }, bundle: true, outfile: bundle, platform: 'node', format: 'cjs', logLevel: 'silent' });
const fixture = path.join(output, 'dense.squid'); await fs.writeFile(fixture, require(bundle).content);
const manifest = path.join(output, 'manifest.json'); await fs.writeFile(manifest, JSON.stringify({ root, output, fixture, baseline }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
const child = spawn(require('electron'), [path.join(root, 'scripts/field-presentation-qa-runner.cjs'), `--field-manifest=${manifest}`], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Field QA exited with ${code}.`))); });
