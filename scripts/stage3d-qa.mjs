// Targeted production WebGL lifecycle checks; never touch the user's desktop profile.
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
import { hardware, fingerprint } from './performance-common.mjs';

const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const build = path.resolve(process.argv.find(arg => arg.startsWith('--build='))?.slice(8) || path.join(root, 'dist'));
const qa = await createQa('stage3d', { timeoutMs: 250000, defaultOutput: path.join(root, '.qa', 'stage3d', baseline ? 'before' : 'after') });
const { output } = qa;
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
await qa.run('stage3d-qa-runner.cjs', 'stage3d-manifest', { build, baseline, fixtures: require(bundle).fixtures, hardware: hardware(), buildSha256: await fingerprint(build) });
