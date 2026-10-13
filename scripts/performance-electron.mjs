// Builds are deliberately explicit: run pnpm build before profiling dist.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createPerformanceFixture } from '../src/performanceFixtures.ts';
import { serializeProject } from '../src/domain.ts';
import { fingerprint, hardware, integerOption, option, root } from './performance-common.mjs';

const require = createRequire(import.meta.url);
const output = path.resolve(option('output', path.join(root, '.qa', 'performance', 'electron')));
const build = path.resolve(option('build', path.join(root, 'dist')));
await access(path.join(build, 'index.html'));
await mkdir(output, { recursive: true });
const names = option('fixture', 'demo,maximum').split(',');
if (!names.every(name => ['demo', 'maximum'].includes(name))) throw new Error('--fixture must be demo, maximum, or demo,maximum.');
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), kind: 'Electron production renderer',
  label: option('label', 'working-tree'), build, buildSha256: await fingerprint(build), hardware: hardware(),
  runnerSha256: createHash('sha256').update(await readFile(path.join(root, 'scripts', 'performance-electron-runner.cjs'))).digest('hex'),
  preloadSha256: createHash('sha256').update(await readFile(path.join(root, 'electron', 'preload.cjs'))).digest('hex'),
  legacyRecovery: process.argv.includes('--legacy-recovery'),
  repetitions: integerOption('repetitions', 50), warmup: integerOption('warmup', 5, 0), frameWindowMs: integerOption('frame-window-ms', 2000),
  profile: path.join(output, 'isolated-profile'), output, fixtures: [] };
for (const name of names) {
  const project = createPerformanceFixture(name);
  const content = serializeProject(project);
  const filename = path.join(output, `${name}.squid`);
  await writeFile(filename, content);
  manifest.fixtures.push({ name, filename, performers: project.performers.length, sets: project.sets.length, utf8Bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex') });
}
const filename = path.join(output, 'manifest.json');
await writeFile(filename, `${JSON.stringify(manifest, null, 2)}\n`);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(root, 'scripts', 'performance-electron-runner.cjs'), `--manifest=${filename}`],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
let log = '';
for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  stream.on('data', chunk => { target.write(chunk); log = `${log}${chunk}`.slice(-100000); });
}
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill(); }, 300000);
let code;
try { code = await new Promise(resolve => {
  child.once('error', error => { log += `\n${error.stack}\n`; });
  child.once('close', code => resolve(code ?? 1));
}); }
finally { clearTimeout(timeout); await writeFile(path.join(output, 'run.log'), log); }
await writeFile(path.join(output, 'run-status.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), exitCode: code, timedOut }, null, 2)}\n`);
if (code !== 0) throw new Error(`Electron profiling failed with exit code ${code}; inspect ${output}.`);
console.log(`Electron report and traces: ${output}`);
