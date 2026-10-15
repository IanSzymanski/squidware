import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createQa, root } from './testing/launcher.mjs';

const qa = await createQa('tooltip', { timeoutMs: 150000, defaultOutput: path.join(root, '.qa', 'tooltips') });
const { output } = qa;
await qa.run('tooltip-qa-runner.cjs', 'tooltip-manifest', { force3DFallback: process.argv.includes('--force-3d-fallback') });
