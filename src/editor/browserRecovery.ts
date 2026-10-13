import { parseProject, validateProject } from '../domain';
import type { Project, RecoveryBridge, RecoveryVersion } from '../types';

// Browser previews use asynchronous structured-clone storage. Desktop recovery
// uses its native worker and has no dependency on browser storage/quota.
export function createBrowserRecovery(): RecoveryBridge {
  let session = '';
  let sequence = 0;
  type Copy = RecoveryVersion & { project: Project };
  let database: Promise<IDBDatabase> | undefined;
  const openDatabase = () => database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('squidware-recovery', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('copies', { keyPath: 'id' }); request.result.createObjectStore('legacy'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('Close another Squidware browser tab and retry recovery.')); };
  });
  function check(token: string) { if (token !== session) throw new Error('Recovery session expired. Retry recovery.'); }
  async function copies() {
    const db = await openDatabase();
    return new Promise<Copy[]>((resolve, reject) => {
      const request = db.transaction('copies').objectStore('copies').getAll();
      request.onsuccess = () => resolve((request.result as Copy[]).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  }
  async function write(project: Project, revision: number, source: 'automatic' | 'legacy' = 'automatic', original?: string) {
    const db = await openDatabase();
    const previous = await copies();
    const version: RecoveryVersion = { id: crypto.randomUUID(), createdAt: Math.max(Date.now(), (previous[0]?.createdAt || 0) + 1),
      revision, source, projectId: project.id, title: project.title, performers: project.performers.length, sets: project.sets.length, bytes: 0 };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['copies', 'legacy'], 'readwrite');
      transaction.objectStore('copies').add({ ...version, project });
      previous.slice(19).forEach(copy => transaction.objectStore('copies').delete(copy.id));
      if (original !== undefined) transaction.objectStore('legacy').put(original, 'original');
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error('Browser recovery is full. Save a project file.'));
    });
    return { status: 'saved' as const, version };
  }
  const list = async () => ({ versions: (await copies()).map(({ project, ...version }) => version), warnings: [] });
  // Serialize mutations so a delayed preview write cannot commit after a newer one.
  let queue = Promise.resolve<unknown>(undefined);
  function enqueue<T>(action: () => Promise<T>): Promise<T> { const next = queue.then(action, action); queue = next; return next; }
  return {
    async beginRecovery() { session = crypto.randomUUID(); sequence = 0; return { session, ...await list() }; },
    async listRecoveries(token) { check(token); await queue; return list(); },
    async readRecovery(token, id) {
      check(token); const copy = (await copies()).find(copy => copy.id === id);
      if (!copy) throw new Error('Recovery copy is no longer available. Refresh the list.');
      return { project: validateProject(copy.project), version: copy };
    },
    writeRecovery(token, next, revision, project) {
      check(token); if (next <= sequence) return Promise.resolve({ status: 'stale' });
      sequence = next;
      return enqueue<{ status: 'saved' | 'stale'; version?: RecoveryVersion }>(() => token === session && next === sequence ? write(project, revision) : Promise.resolve({ status: 'stale' as const }));
    },
    async migrateRecovery(token, content) {
      check(token);
      let project;
      try { project = parseProject(content); }
      catch (error) { return { status: 'unreadable', warning: `Legacy browser recovery was kept unchanged. ${(error as Error).message}` }; }
      await enqueue(() => write(project, 0, 'legacy', content));
      return { status: 'migrated' };
    },
  };
}
