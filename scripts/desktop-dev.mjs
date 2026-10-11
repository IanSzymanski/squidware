import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererUrl = 'http://127.0.0.1:5173/';
const viteEntry = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const electronBinary = require('electron');
const children = new Set();
let shuttingDown = false;

// Refuse an occupied port so Electron can never attach to an unrelated server.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error('Port 5173 is already in use. Stop that server before starting desktop mode.')));
  probe.listen(5173, '127.0.0.1', () => probe.close(resolve));
});

function start(executable, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit', windowsHide: true, shell: false });
  children.add(child);
  child.once('exit', () => children.delete(child));
  child.once('error', (error) => { console.error(error.message); shutdown(1); });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  const fallback = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(code);
  }, 3000);
  fallback.unref();
  Promise.all([...children].map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', resolve);
  }))).then(() => { clearTimeout(fallback); process.exit(code); });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const vite = start(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort']);
vite.once('exit', (code) => { if (!shuttingDown) shutdown(code || 1); });

try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !shuttingDown; attempt += 1) {
    try {
      const response = await fetch(rendererUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Vite is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Vite did not become ready within 10 seconds.');
  const electron = start(electronBinary, ['.', ...process.argv.slice(2)], { ELECTRON_RENDERER_URL: rendererUrl });
  electron.once('exit', (code) => shutdown(code ?? 1));
} catch (error) {
  console.error(error.message);
  shutdown(1);
}
