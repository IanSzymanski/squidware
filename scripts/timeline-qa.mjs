import { createRequire } from 'node:module';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('timeline', { timeoutMs: 180000 }), require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }));
const bundle = path.join(qa.output, 'fixtures.cjs');
await esbuild.build({ stdin: { contents: `
  import {createLegacyPerformanceFixture} from './src/performanceFixtures';
  import {migrateProjectV1} from './src/projectV2';
  export {setStartCount, sampleTimeline, totalCounts} from './src/domain';
  export function fixture() {
    const p=createLegacyPerformanceFixture('maximum');
    p.title='Timeline navigation · 128 sets'; p.performers=p.performers.slice(0,8);
    p.sets.forEach((s,i)=>{s.counts=i ? [1,8,32,1024][(i-1)%4] : 0; s.positions=Object.fromEntries(p.performers.map(p=>[p.id,s.positions[p.id]]));});
    return migrateProjectV1(p);
  }
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
await qa.run('timeline-qa-runner.cjs', 'timeline-manifest', { bundle, smallDesktop: process.argv.includes('--small-desktop') });
