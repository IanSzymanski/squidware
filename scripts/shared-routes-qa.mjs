import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';
const qa = await createQa('shared-routes', { timeoutMs: 180000 });
const fixture = path.join(qa.output, 'routes.squid');
await fs.copyFile(path.join(root, 'format/examples/basic-v2.squid'), fixture);
await qa.run('shared-routes-qa-runner.cjs', 'route-manifest', { fixture });
