import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.resolve(process.argv[2] || path.join(root, '.qa', 'tooltips'));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'profile-'));
const manifest = path.join(output, 'manifest.json');
await fs.writeFile(manifest, JSON.stringify({ root, output, profile, force3DFallback: process.argv.includes('--force-3d-fallback') }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
const child = spawn(require('electron'), [path.join(root, 'scripts/tooltip-qa-runner.cjs'), `--tooltip-manifest=${manifest}`], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
const timeout = setTimeout(() => child.kill(), 150000);
try { await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Tooltip QA exited with ${code}.`))); }); }
finally { clearTimeout(timeout); }
