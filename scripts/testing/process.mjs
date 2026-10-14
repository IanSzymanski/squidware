import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
async function stopTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    await execute('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
  } else {
    // Include grandchildren even when a launcher starts its own process group.
    const { stdout } = await execute('ps', ['-eo', 'pid=,ppid=']).catch(() => ({ stdout: '' }));
    const rows = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
    const descendants = [child.pid];
    for (let index = 0; index < descendants.length; index++) {
      for (const [pid, parent] of rows) if (parent === descendants[index] && !descendants.includes(pid)) descendants.push(pid);
    }
    for (const pid of descendants.reverse()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
  child.kill('SIGKILL');
}

/** One watchdog, process-tree cleanup, and durable logs for every test subprocess. */
export async function runProcess(command, args, { cwd, env = process.env, timeoutMs = 240000, logFile, live = true } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('A positive process timeout is required.');
  if (logFile) await mkdir(path.dirname(logFile), { recursive: true });
  const log = logFile ? createWriteStream(logFile) : null;
  const started = Date.now();
  const cleanEnv = { ...env }; delete cleanEnv.ELECTRON_RUN_AS_NODE; delete cleanEnv.ELECTRON_RENDERER_URL;
  let child;
  let timer;
  let timedOut = false;
  let failure;
  let logFailure;
  log?.on('error', error => { logFailure = error; });
  const completion = new Promise(resolve => {
    child = spawn(command, args, { cwd, env: cleanEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = stream => data => { if (live) stream.write(data); if (!log?.destroyed) log?.write(data); };
    child.stdout.on('data', output(process.stdout)); child.stderr.on('data', output(process.stderr));
    child.once('error', error => { failure = error.message; });
    child.once('close', (exitCode, signal) => { clearTimeout(timer); resolve({ exitCode, signal }); });
    timer = setTimeout(() => { timedOut = true; void stopTree(child); }, timeoutMs);
  });
  const result = await completion;
  if (log && !log.destroyed) await new Promise(resolve => log.end(resolve));
  return { status: timedOut ? 'timed_out' : failure || logFailure ? 'error' : result.exitCode === 0 ? 'passed' : 'failed',
    ...result, elapsedMs: Date.now() - started, logFile, error: failure ?? logFailure?.message };
}

export async function requireProcess(command, args, options) {
  const result = await runProcess(command, args, options);
  if (result.status !== 'passed') throw new Error(`${path.basename(command)} ${result.status} (exit ${result.exitCode ?? result.signal ?? 'unavailable'}). Log: ${result.logFile ?? 'console'}`);
  return result;
}
