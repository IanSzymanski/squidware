import { Modal } from '../components/Modal';
import { HISTORY_LIMITS } from './history';
import { useEditorSelector, useEditorStore } from './react';

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const history = useEditorSelector(state => state.project);
  const store = useEditorStore();
  const undo = history.past.at(-1);
  const redo = history.future[0];
  return <Modal title="History" onClose={onClose}>
    <p className="modal-intro">Changes in this session. Undo and redo keep each action together.</p>
    <div className="history-actions">
      <button className="button subtle" disabled={!undo || !!history.transactionName} onClick={() => store.dispatch('history.undo')}>Undo{undo ? ` ${undo.name}` : ''}</button>
      <button className="button subtle" disabled={!redo || !!history.transactionName} onClick={() => store.dispatch('history.redo')}>Redo{redo ? ` ${redo.name}` : ''}</button>
    </div>
    {history.transactionName && <p role="status">Editing: {history.transactionName}. Finish or cancel before undoing.</p>}
    <h3 className="modal-subtitle">Recent actions</h3>
    <ol className="history-list">{[...history.past].reverse().map(entry => <li key={entry.afterRevision}><span>{entry.name}</span>{entry === undo && <small>Current</small>}</li>)}</ol>
    {!history.past.length && <p className="microcopy">No actions to undo.</p>}
    {!!history.future.length && <><h3 className="modal-subtitle">Ready to redo</h3><ol className="history-list future">{history.future.map(entry => <li key={entry.afterRevision}>{entry.name}</li>)}</ol></>}
    <p className="history-policy">Up to {HISTORY_LIMITS.entries} actions or {HISTORY_LIMITS.estimatedBytes / 1024 / 1024} MiB of estimated history. The latest action is always retained, including a larger action. Opening another production clears history.</p>
    {history.droppedEntries > 0 && <p className="history-policy" role="status">{history.droppedEntries} older actions have expired. Save named project files to keep versions.</p>}
  </Modal>;
}
