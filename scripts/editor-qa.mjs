// Exercise the production renderer, actual preload and main-process file handlers.
// Native dialogs are controlled by the runner; all files/recovery use an isolated profile.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.resolve(process.argv[2] || path.join(root, '.qa', 'editor'));
await fs.mkdir(output, { recursive: true });
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(output, 'boundary-fixture.cjs');
await esbuild.build({
  stdin: { contents: `
    import { createDemoProject, PROJECT_LIMITS, serializeProject } from './src/domain';
    const project = createDemoProject();
    project.title = 'Editor boundary QA';
    project.sections = Array.from({ length: PROJECT_LIMITS.sections }, (_, i) => ({ id: i < 4 ? project.sections[i].id : 'section-' + i, name: 'Section ' + i, color: '#abcdef' }));
    project.sets[1].counts = PROJECT_LIMITS.counts.max;
    project.sets[1].tempo = PROJECT_LIMITS.tempo.max;
    project.sets[1].notes = 'N'.repeat(PROJECT_LIMITS.text.notes);
    export const fixture = serializeProject(project);
  `, resolveDir: root, loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
});
await fs.writeFile(path.join(output, 'boundary.squid'), require(bundle).fixture);
const manifest = path.join(output, 'manifest.json');
await fs.writeFile(manifest, JSON.stringify({ root, output }));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
const child = spawn(require('electron'), [path.join(root, 'scripts', 'editor-qa-runner.cjs'), `--editor-qa-manifest=${manifest}`], { cwd: root, env: environment, windowsHide: true, stdio: 'inherit' });
await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Editor QA exited with ${code}.`))); });
