import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const require = createRequire(import.meta.url);
const baseline = process.argv.includes('--baseline');
const qa = await createQa('field-presentation', { timeoutMs: 240000, defaultOutput: path.join(root, '.qa', baseline ? 'field-before' : 'field-presentation') });
const { output } = qa;
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
await qa.run('field-presentation-qa-runner.cjs', 'field-manifest', { fixture, baseline });
