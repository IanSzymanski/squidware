// Real desktop recovery across two process launches, using only an isolated profile.
import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
import { hardware, fingerprint } from './performance-common.mjs';
const require = createRequire(import.meta.url);
const qa = await createQa('recovery', { timeoutMs: 150000 });
const { output } = qa;
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
await qa.run('recovery-qa-runner.cjs', 'recovery-manifest', { fixtureFile, fixtureBytes: Buffer.byteLength(content), hardware: hardware(), buildSha256: await fingerprint(path.join(root, 'dist')) }, ["write","restart"]);
