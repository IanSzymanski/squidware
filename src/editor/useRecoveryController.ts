import { useEffect, useRef, useState } from 'react';
import type { Project, RecoveryBridge, RecoveryList } from '../types';
import { bootstrapRecovery } from './recoveryBootstrap';
import { useEditorSelector, useEditorStore } from './react';
import { createBrowserRecovery } from './browserRecovery';

export function useRecoveryController(loadProject: (project: Project) => void) {
  const store = useEditorStore();
  const history = useEditorSelector(state => state.project);
  const [bridge] = useState<RecoveryBridge>(() => window.squidware || createBrowserRecovery());
  const session = useRef('');
  const sequence = useRef(0);
  const bootstrap = useRef<Promise<RecoveryList> | undefined>(undefined);
  const started = useRef(false);
  const [ready, setReady] = useState(false);
  const [list, setList] = useState<RecoveryList>({ versions: [], warnings: [] });
  const [status, setStatus] = useState('Checking recovery…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  async function initialize() {
    const result = await bootstrapRecovery(bridge, () => localStorage);
    session.current = result.session;
    return result;
  }
  useEffect(() => {
    let active = true;
    const pending = bootstrap.current ||= initialize();
    void pending.then(result => {
      if (!active) return;
      setList(result); setReady(true); setStatus(result.versions.length ? 'Recovery copies available' : 'Recovery ready');
      if (result.versions.length || result.warnings.length) {
        // Async startup must never overwrite edits made while storage was opening.
        const current = store.getState();
        if (current.project.revision === 0 && !current.project.transactionName && !current.ui.pendingDraft && current.ui.dialog === null) store.dispatch('dialog.open', { dialog: 'recovery' });
        else store.setValue('ui', 'toast', 'Recovery copies are available in the project menu.');
      }
    }, failure => { if (active) { if (bootstrap.current === pending) bootstrap.current = undefined; setError((failure as Error).message); setStatus('Recovery unavailable'); } });
    return () => { active = false; };
  }, [bridge, store]);
  useEffect(() => {
    if (!ready || history.transactionName) return;
    if (!started.current && history.revision === 0 && !history.future.length) return;
    started.current = true;
    const nextSequence = ++sequence.current;
    setStatus('Recovery pending…');
    const timeout = setTimeout(() => {
      setStatus('Writing recovery…');
      void bridge.writeRecovery(session.current, nextSequence, history.revision, history.present).then(result => {
        if (nextSequence !== sequence.current || result.status !== 'saved') return;
        setStatus('Recovery copy saved'); setError('');
      }, failure => {
        if (nextSequence !== sequence.current) return;
        setStatus('Recovery unavailable'); setError(`${(failure as Error).message} Save your project to a file.`);
      });
    }, 700);
    return () => clearTimeout(timeout);
  }, [bridge, ready, history.present, history.revision, history.transactionName, retryVersion]);
  async function refresh() {
    setBusy(true);
    try {
      const result = ready ? await bridge.listRecoveries(session.current) : await (bootstrap.current ||= initialize());
      setList(result); setReady(true); setError('');
      if (!ready) setStatus(result.versions.length ? 'Recovery copies available' : 'Recovery ready');
      else if (status === 'Recovery unavailable') setRetryVersion(value => value + 1);
    } catch (failure) { if (!ready) bootstrap.current = undefined; setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function restore(id: string) {
    const before = store.getState();
    if (before.ui.pendingDraft || before.project.transactionName || document.querySelector('[aria-invalid="true"]')) { setError('Finish or cancel the pending edit before restoring a copy.'); return; }
    if (before.project.revision !== before.fileSession.savedRevision && !window.confirm('Replace your current production with this recovery copy? Save a project file first to keep your latest edits.')) return;
    setBusy(true);
    try {
      const result = await bridge.readRecovery(session.current, id);
      const current = store.getState();
      if (current.project.present !== before.project.present || current.ui.projectEpoch !== before.ui.projectEpoch || current.ui.pendingDraft || current.project.transactionName) throw new Error('The production changed while recovery was opening. Retry when the edit is finished.');
      loadProject(result.project);
      window.squidware?.resetProject();
      store.setValue('fileSession', 'savedRevision', -1);
      store.setValue('fileSession', 'needsSaveAs', true);
      store.setValue('fileSession', 'saveStatus', 'Recovered copy · save a project file');
      store.setValue('ui', 'toast', 'Recovery copy restored. Use Save to keep a project file.');
      setError('');
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return { ...list, status, error, busy, refresh, restore };
}
