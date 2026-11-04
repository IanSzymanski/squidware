import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
import { hardware, fingerprint } from './performance-common.mjs';
const require = createRequire(import.meta.url);
const profileWorkloads = !process.argv.includes('--capture-only') && (process.argv.includes('--profile') || process.argv.includes('--baseline'));
const baseline = process.argv.includes('--baseline');
const build = path.resolve(process.argv.find(arg => arg.startsWith('--build='))?.slice(8) || path.join(root, 'dist'));
const qa = await createQa('field-renderer', { timeoutMs: 360000, defaultOutput: path.join(root, '.qa/field-renderer', baseline ? 'before' : 'after') });
const bundle = path.join(qa.output, 'fixtures.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `import { createPerformanceFixture } from './src/performanceFixtures'; import { sampleProject } from './src/domain'; export const fixtures = ['demo','maximum'].map(name => (()=>{const project=createPerformanceFixture(name);return {name,project,sample:sampleProject(project,4.25).positions}})());`, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
const fixtures = require(bundle).fixtures.map(fixture => { const content = JSON.stringify(fixture.project); return {...fixture, sha256:createHash('sha256').update(content).digest('hex'), sizeBytes:Buffer.byteLength(content)}; });
await qa.run('field-renderer-qa-runner.cjs', 'field-renderer-manifest', { build, appBuild: build, baseline, profileWorkloads, fixtures, hardware: hardware(), buildSha256: await fingerprint(build) });

const result = JSON.parse(await fs.readFile(path.join(qa.output, 'results.json'), 'utf8'));
if (profileWorkloads ? result.reports.length !== 16 : baseline ? result.reports.length !== 0 : result.checks.length !== 2) throw new Error('Incomplete field renderer report.');
