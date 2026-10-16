import { promises as fs } from 'node:fs';
import path from 'node:path';
import { root } from './testing/launcher.mjs';
import { requireProcess } from './testing/process.mjs';
import { runPnpm } from './testing/pnpm.mjs';
import { sourceIdentity, stampName, writeBuildStamp } from './testing/provenance.mjs';

const before = await sourceIdentity(root);
await fs.rm(path.join(root, 'dist', stampName), { force: true });
await requireProcess(process.execPath, ['scripts/build-project-codec.mjs'], { cwd: root });
await runPnpm(['licenses:check'], { cwd: root });
await runPnpm(['exec', 'tsc', '-b'], { cwd: root });
await runPnpm(['exec', 'vite', 'build'], { cwd: root });
const stamp = await writeBuildStamp(root, before);
console.log(`Built source ${stamp.source.revision} (${stamp.source.contentHash.slice(0, 12)}${stamp.source.dirty ? ', dirty' : ''}).`);
