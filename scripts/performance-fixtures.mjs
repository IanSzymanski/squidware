import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPerformanceFixture } from '../src/performanceFixtures.ts';
import { serializeProject } from '../src/domain.ts';
import { option, root } from './performance-common.mjs';

const output = path.resolve(option('output', path.join(root, '.qa', 'performance', 'fixtures')));
await mkdir(output, { recursive: true });
for (const name of ['demo', 'maximum']) {
  const content = serializeProject(createPerformanceFixture(name));
  await writeFile(path.join(output, `${name}.squid`), content);
  console.log(`${name}: ${Buffer.byteLength(content)} bytes -> ${path.join(output, `${name}.squid`)}`);
}
