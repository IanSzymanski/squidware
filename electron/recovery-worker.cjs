'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { createRecoveryStorage } = require('./recovery-storage.cjs');
const storage = createRecoveryStorage(workerData.directory);
let session = workerData.session;
let latestSequence = 0;
let queue = Promise.resolve();
parentPort.on('message', ({ id, operation, args }) => {
  if (operation === 'begin') { session = args.session; latestSequence = 0; }
  if (operation === 'write' && args.session === session) latestSequence = Math.max(latestSequence, args.sequence);
  const current = () => args.session === session && args.sequence === latestSequence;
  queue = queue.then(async () => {
    if (operation !== 'begin' && args.session !== session) return { status: 'stale' };
    switch (operation) {
      case 'begin': return storage.list(true);
      case 'list': return storage.list(true);
      case 'read': return storage.read(args.versionId);
      case 'migrate': return storage.migrate(args.content);
      case 'write': return current() ? storage.write(args.project, args.revision, current) : { status: 'stale' };
      default: throw new Error('Unsupported recovery operation.');
    }
  }).then(result => parentPort.postMessage({ id, result }), error => parentPort.postMessage({ id, error: error.message }));
});
