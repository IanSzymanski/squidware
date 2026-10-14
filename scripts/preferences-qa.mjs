// Actual production desktop, three launches, isolated preferences and project files.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || path.join(root, '.qa/preferences'));
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(output, 'profile-'));
await fs.writeFile(path.join(profile, 'preferences.json'), '{"version":0,"zoom":1.1}');
const fixtureFile = path.join(output, 'original.squid');
const fixture = JSON.parse(await fs.readFile(path.join(root, 'src/fixtures/schema-v2.squid'), 'utf8'));
await fs.writeFile(fixtureFile, JSON.stringify(fixture));
const other = structuredClone(fixture); other.title = 'Another production with its own rules'; other.field.preset = 'high-school'; other.audioOffsetSeconds = 4; other.moves[0].tempo = 144;
const otherFile = path.join(output, 'other.squid'); await fs.writeFile(otherFile, JSON.stringify(other));
const manifest = path.join(output, 'manifest.json'); await fs.writeFile(manifest, JSON.stringify({ root, output, profile, fixtureFile, otherFile }));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL;
for (const phase of ['write', 'restart', 'reset-restart', 'quit-restart']) {
  const child = spawn(require('electron'), [path.join(root, 'scripts/preferences-qa-runner.cjs'), `--preferences-manifest=${manifest}`, `--phase=${phase}`], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => child.kill(), 90000);
  try { await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Preferences QA ${phase} exited with ${code}.`))); }); } finally { clearTimeout(timeout); }
}

