// Targeted production WebGL lifecycle checks; never touch the user's desktop profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hardware, fingerprint } from './performance-common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const build = path.resolve(process.argv.find(arg => arg.startsWith('--build='))?.slice(8) || path.join(root, 'dist'));
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || path.join(root, '.qa', 'stage3d', baseline ? 'before' : 'after'));
await fs.mkdir(output, { recursive: true });
await fs.rm(path.join(output, 'report.json'), { force: true });
const bundle = path.join(output, 'fixtures.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createPerformanceFixture } from './src/performanceFixtures';
  import { serializeProject } from './src/domain';
  export const fixtures = ['demo', 'maximum'].map(name => {
    const project = createPerformanceFixture(name);
    return { name, content: serializeProject(project), count: project.performers.length, firstId: project.performers[0].id, section: project.sections[0].name };
  });
`, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const manifestPath = path.join(output, 'manifest.json');
await fs.writeFile(manifestPath, JSON.stringify({ root, build, output, baseline, fixtures: require(bundle).fixtures, hardware: hardware(), buildSha256: await fingerprint(build) }));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(root, 'scripts', 'stage3d-qa-runner.cjs'), `--stage3d-manifest=${manifestPath}`], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
const timeout = setTimeout(() => child.kill(), 250000);
try { await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`3D QA exited with ${code}.`))); }); }
finally { clearTimeout(timeout); }
