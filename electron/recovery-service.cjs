'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function createRecoveryService(directory) {
  let worker;
  let session;
  let sequence = 0;
  let requestId = 0;
  let closed = false;
  let writeActive = false;
  let queuedWrite;
  const pending = new Map();
  function request(operation, args) {
    if (closed) return Promise.reject(new Error('Recovery service closed.'));
    if (!worker) {
      // Node workers use real files in packaged apps; electron-builder unpacks these modules.
      const workerFile = path.join(__dirname.replace(/app\.asar(?=[/\\])/, 'app.asar.unpacked'), 'recovery-worker.cjs');
      worker = new Worker(workerFile, { workerData: { directory, session } });
      const owner = worker;
      worker.unref();
      worker.on('message', ({ id, result, error }) => {
        const waiter = pending.get(id); if (!waiter) return;
        pending.delete(id); clearTimeout(waiter.timeout);
        if (error) waiter.reject(new Error(`Recovery unavailable: ${error} Save a project file, then retry recovery.`));
        else waiter.resolve(result);
      });
      const fail = error => {
        if (worker !== owner) return;
        for (const waiter of pending.values()) { clearTimeout(waiter.timeout); waiter.reject(error); }
        pending.clear(); worker = undefined;
      };
      worker.on('error', fail);
      worker.on('exit', code => fail(new Error(`Recovery worker stopped (${code}). Save a project file and retry.`)));
    }
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Recovery timed out. Save a project file and retry.')); }, 60000);
      pending.set(id, { resolve, reject, timeout });
      try { worker.postMessage({ id, operation, args }); }
      catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
    });
  }
  function assertSession(token) {
    if (typeof token !== 'string' || token !== session) throw new Error('Recovery session expired. Reopen Recovery copies to retry.');
  }
  async function drainWrites() {
    if (writeActive || !queuedWrite) return;
    const job = queuedWrite; queuedWrite = undefined; writeActive = true;
    try {
      if (job.args.session !== session || job.args.sequence !== sequence) job.resolve({ status: 'stale' });
      else job.resolve(await request('write', job.args));
    } catch (error) { job.reject(error); }
    finally { writeActive = false; void drainWrites(); }
  }
  return {
    async begin() { session = randomUUID(); sequence = 0; const token = session; return { session: token, ...await request('begin', { session: token }) }; },
    list(token) { assertSession(token); return request('list', { session: token }); },
    read(token, versionId) { assertSession(token); return request('read', { session: token, versionId }); },
    migrate(token, content) { assertSession(token); return request('migrate', { session: token, content }); },
    write(token, nextSequence, revision, project) {
      assertSession(token);
      if (!Number.isSafeInteger(nextSequence) || nextSequence < 1 || !Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid recovery revision.');
      if (nextSequence <= sequence) return Promise.resolve({ status: 'stale' });
      sequence = nextSequence;
      // At most one worker write and one latest pending project, even on a slow disk.
      if (queuedWrite) queuedWrite.resolve({ status: 'stale' });
      return new Promise((resolve, reject) => {
        queuedWrite = { args: { session: token, sequence, revision, project }, resolve, reject };
        void drainWrites();
      });
    },
    async close() { closed = true; if (queuedWrite) { queuedWrite.resolve({ status: 'stale' }); queuedWrite = undefined; } if (worker) await worker.terminate(); },
  };
}
module.exports = { createRecoveryService };
