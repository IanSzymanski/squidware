// Production desktop: the separate 3D window (#181) opened through the real main process, three launches, isolated profile.
import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';

const require = createRequire(import.meta.url);
const qa = await createQa('popout-3d', { timeoutMs: 240000 });
const { output } = qa;
const bundle = path.join(output, 'fixtures.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createPerformanceFixture } from './src/performanceFixtures';
  import { serializeProject } from './src/domain';
  export const fixtures = ['demo', 'maximum'].map(name => {
    const project = createPerformanceFixture(name);
    return { name, content: serializeProject(project), count: project.performers.length, sets: project.sets.length };
  });
`, resolveDir: root, loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
await qa.run('popout-3d-qa-runner.cjs', 'popout-manifest', { fixtures: bundle, softwareWebgl: process.platform === 'linux' }, ['mirror', 'restore', 'clamp']);
