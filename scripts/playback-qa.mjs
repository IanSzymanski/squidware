import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
import { hardware, fingerprint } from './performance-common.mjs';
const require = createRequire(import.meta.url);
const qa = await createQa('playback', { timeoutMs: 180000 });
const { output } = qa;
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(output, 'fixture.cjs');
await esbuild.build({ stdin: { contents: `
  import { createPerformanceFixture } from './src/performanceFixtures';
  import { serializeProject } from './src/domain';
  const project = createPerformanceFixture('maximum');
  
  export const content = serializeProject(project);
`, resolveDir: root, loader: 'ts' }, bundle: true, outfile: bundle, platform: 'node', format: 'cjs', logLevel: 'silent' });
const fixture = path.join(output, 'maximum.squid'); await fs.writeFile(fixture, require(bundle).content);
await qa.run('playback-qa-runner.cjs', 'playback-manifest', { fixture, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), hardware: hardware(), sourceSha256: await fingerprint(path.join(root, 'src')), buildSha256: await fingerprint(path.join(root, 'dist')) });
