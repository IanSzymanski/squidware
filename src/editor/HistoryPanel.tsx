import { Modal } from '../components/Modal';
import { HelpButton } from './ControlHelp';
import { HISTORY_LIMITS } from './history';
import { useEditorSelector, useEditorStore } from './react';

export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const history = useEditorSelector(state => state.project);
  const store = useEditorStore();
  const undo = history.past.at(-1);
  const redo = history.future[0];
  const editing = history.transactionName ? `Finish or cancel ${history.transactionName} first.` : '';
  return <Modal title="History" onClose={onClose}>
    <p className="modal-intro">Changes in this session. Undo and redo keep each action together.</p>
    <div className="history-actions">
      <HelpButton command="history.undo" title={undo ? `Undo ${undo.name}` : 'Undo'} className="button subtle" disabled={!undo || !!editing} disabledReason={editing || 'There are no actions to undo.'} onClick={() => store.dispatch('history.undo')}>Undo{undo ? ` ${undo.name}` : ''}</HelpButton>
      <HelpButton command="history.redo" title={redo ? `Redo ${redo.name}` : 'Redo'} className="button subtle" disabled={!redo || !!editing} disabledReason={editing || 'There are no undone actions to redo.'} onClick={() => store.dispatch('history.redo')}>Redo{redo ? ` ${redo.name}` : ''}</HelpButton>
    </div>
    {history.transactionName && <p role="status">Editing: {history.transactionName}. Finish or cancel before undoing.</p>}
    <h3 className="modal-subtitle">Recent actions</h3>
    {history.past.length ? <ol className="history-list">{[...history.past].reverse().map(entry => <li key={entry.afterRevision}><span>{entry.name}</span>{entry === undo && <small>Current</small>}</li>)}</ol> : <p className="microcopy history-empty">No actions to undo.</p>}
    {!!history.future.length && <><h3 className="modal-subtitle">Ready to redo</h3><ol className="history-list future">{history.future.map(entry => <li key={entry.afterRevision}>{entry.name}</li>)}</ol></>}
    <p className="history-policy">Up to {HISTORY_LIMITS.entries} actions or {HISTORY_LIMITS.estimatedBytes / 1024 / 1024} MiB of estimated history. The latest action is always retained, including a larger action. Opening another production clears history.</p>
    {history.droppedEntries > 0 && <p className="history-policy" role="status">{history.droppedEntries} older actions have expired. Save named project files to keep versions.</p>}
  </Modal>;
}
