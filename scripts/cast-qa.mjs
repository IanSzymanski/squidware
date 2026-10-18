import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const require = createRequire(import.meta.url);
const qa = await createQa('cast', { timeoutMs: 180000 });
const bundle = path.join(qa.output, 'fixture.cjs');
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
await esbuild.build({ stdin: { contents: `
  import { createLegacyPerformanceFixture } from './src/performanceFixtures';
  import { migrateProjectV1 } from './src/projectV2';
  import { serializeProject } from './src/domain';
  const project = createLegacyPerformanceFixture('maximum');
  project.title = 'Cast beside the field'; project.sets = project.sets.slice(0, 2);
  for (const set of project.sets) set.positions = Object.fromEntries(project.performers.map((p, i) => [p.id, {x:35+i%25*1.25,y:14+Math.floor(i/25)*1.25}]));
  export const content = serializeProject(migrateProjectV1(project));
`, resolveDir: root, loader: 'ts' }, bundle: true, outfile: bundle, platform: 'node', format: 'cjs', logLevel: 'silent' });
const fixture = path.join(qa.output, 'maximum.squid'); await fs.writeFile(fixture, require(bundle).content);
await qa.run('cast-qa-runner.cjs', 'cast-manifest', { fixture });
