import { useState } from 'react';
import { Check, RotateCcw, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { HelpButton } from '../editor/ControlHelp';
import { canSwitchWorkspace } from '../editor/workspaceCommands';
import type { EditorController } from '../editor/useEditorController';
import { MAX_WORKSPACES, isBuiltInWorkspace } from '../workspaces';

const BUILT_IN_NAMES: Record<string, string> = { design: 'Write', production: 'Plan', rehearse: 'Rehearse', review: 'Split review', field: 'Field only' };
/** Built-in workspaces show the mode they stand behind, unless the writer renamed them. */
const displayName = (id: string, name: string) => BUILT_IN_NAMES[id] && name.toLowerCase() === id ? BUILT_IN_NAMES[id] : name;
const BUILT_IN_NOTES: Record<string, string> = {
  design: 'The field, tools and side panel.',
  production: 'The production sheet.',
  rehearse: '3D playback and review.',
  review: 'The 2D field beside a live 3D preview.',
  field: 'The field alone, with a compact timeline.',
};

/** Saved arrangements of the shell: the built-in ones behind each mode, and any the writer names. */
export function WorkspacesDialog({ controller: c, onClose }: { controller: EditorController; onClose: () => void }) {
  const [name, setName] = useState(''), [renaming, setRenaming] = useState<string | null>(null), [draft, setDraft] = useState(''), [error, setError] = useState('');
  const workspaces = c.preferences.value.workspaces;
  const locked = !canSwitchWorkspace(c.store.getState());
  const run = (action: () => unknown) => { setError(''); if (action() !== true) setError(c.store.getState().ui.toast || 'Finish the active preview or input first.'); };
  const full = workspaces.entries.length >= MAX_WORKSPACES;
  return <Modal title="Workspaces" onClose={onClose}>
    <p className="modal-intro">A workspace remembers the mode, view, side panel and timeline you had open. They are saved on this device.</p>
    <ul className="workspace-list">
      {workspaces.entries.map(entry => {
        const active = entry.id === workspaces.active, builtIn = isBuiltInWorkspace(entry.id);
        return <li key={entry.id} className={active ? 'selected' : ''}>
          {renaming === entry.id
            ? <form className="workspace-rename" onSubmit={event => { event.preventDefault(); run(() => { const done = c.dispatch('workspace.rename', { id: entry.id, name: draft }); if (done === true) setRenaming(null); return done; }); }}>
              <input autoFocus aria-label="Workspace name" maxLength={40} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRenaming(null); } }} />
              <button className="button primary small" disabled={!draft.trim()}>Rename</button>
              <button type="button" className="button small" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
            : <>
              <HelpButton pointerPassThrough title={`${displayName(entry.id, entry.name)} workspace`} description="Switch to this arrangement. The production, selection and playhead stay as they are." className="workspace-choice" aria-pressed={active}
                disabled={locked} disabledReason="Finish the active preview, gesture or dialog first." onClick={() => run(() => c.dispatch('workspace.select', { id: entry.id }))}>
                <span className="workspace-choice-check">{active && <Check size={14} />}</span>
                <span className="workspace-choice-text"><strong>{displayName(entry.id, entry.name)}</strong><small>{BUILT_IN_NOTES[entry.id] ?? 'Your saved arrangement.'}</small></span>
              </HelpButton>
              {builtIn
                ? <HelpButton title={`Reset ${displayName(entry.id, entry.name)}`} description="Restore this built-in workspace to its original arrangement and name." className="icon-button" disabled={locked} onClick={() => run(() => c.dispatch('workspace.reset', { id: entry.id }))}><RotateCcw size={14} /></HelpButton>
                : <>
                  <button type="button" className="button small" disabled={locked} onClick={() => { setRenaming(entry.id); setDraft(entry.name); }}>Rename</button>
                  <HelpButton title={`Delete ${entry.name}`} description="Delete this saved workspace. If it is active, Write mode opens." className="icon-button" disabled={locked} onClick={() => run(() => c.dispatch('workspace.delete', { id: entry.id }))}><Trash2 size={14} /></HelpButton>
                </>}
            </>}
        </li>;
      })}
    </ul>
    <form className="workspace-save" onSubmit={event => { event.preventDefault(); run(() => { const done = c.dispatch('workspace.save', { name }); if (done === true) setName(''); return done; }); }}>
      <label className="form-label">Save the current arrangement as<input aria-label="New workspace name" placeholder="Name, for example Battery cleaning" maxLength={40} value={name} disabled={locked || full} onChange={event => setName(event.target.value)} /></label>
      <button className="button primary" disabled={locked || full || !name.trim()}>Save workspace</button>
    </form>
    {(error || full) && <p className="field-error" role="alert">{error || 'Keep at most 16 saved workspaces. Delete one before saving another.'}</p>}
    <div className="modal-actions"><button type="button" className="button" onClick={onClose}>Done</button></div>
  </Modal>;
}
