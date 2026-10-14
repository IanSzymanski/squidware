import type { Project } from '../types';
import type { EditorState } from './state';
import type { EditorStore } from './store';

export const isFileDirty = (state: EditorState) => state.project.revision !== state.fileSession.savedRevision;
export const hasUnsavedWork = (state: EditorState) => isFileDirty(state) || state.ui.pendingDraft;

export function fileStatusText(state: EditorState): string {
  const details = [
    state.ui.pendingDraft ? 'Draft pending' : '',
    state.fileSession.fileOperation === 'saving' ? 'Saving…' : '',
    ['Save canceled', 'Save failed'].includes(state.fileSession.saveStatus) ? state.fileSession.saveStatus : '',
  ].filter(Boolean);
  if (hasUnsavedWork(state)) return ['Unsaved changes', ...details].join(' · ');
  if (state.fileSession.fileOperation === 'saving') return 'Saving project file…';
  // Undo back to the saved revision is saved, even after an earlier failed save.
  return state.fileSession.saveStatus === 'Project download requested' ? 'Project download requested' : 'Project file saved';
}

/** Set the baseline only after a file has actually opened, never for new/recovery loads. */
export function markFileOpened(store: EditorStore, needsSaveAs: boolean) {
  store.setValue('fileSession', 'savedRevision', store.getState().project.revision);
  store.setValue('fileSession', 'needsSaveAs', needsSaveAs);
  store.setValue('fileSession', 'saveStatus', 'Project file opened');
}

export function assertCanReplace(state: EditorState) {
  if (state.fileSession.fileOperation) throw new Error('Finish the current file operation before replacing the production.');
  if (state.ui.pendingDraft || state.project.transactionName) throw new Error('Finish or cancel the pending edit before replacing the production.');
}

export function assertUnchangedSince(before: EditorState, current: EditorState) {
  if (current.ui.projectEpoch !== before.ui.projectEpoch || current.project.revision !== before.project.revision
      || current.ui.pendingDraft || current.project.transactionName) {
    throw new Error('The production changed while the file was opening. Retry when the edit is finished.');
  }
}

/** The writer receives the captured project, so later edits cannot be marked saved. */
export async function saveProjectRevision(store: EditorStore,
  writer: (project: Project, saveAs: boolean) => Promise<boolean>, saveAs = false,
): Promise<'saved' | 'canceled' | 'stale' | 'busy'> {
  const before = store.getState();
  if (before.fileSession.fileOperation) return 'busy';
  if (before.ui.pendingDraft || before.project.transactionName) throw new Error('Finish or cancel the pending edit before saving.');
  store.setValue('fileSession', 'fileOperation', 'saving');
  try {
    const saved = await writer(before.project.present, saveAs || before.fileSession.needsSaveAs);
    if (store.getState().ui.projectEpoch !== before.ui.projectEpoch) return 'stale';
    store.setValue('fileSession', 'saveStatus', saved ? 'Project file saved' : 'Save canceled');
    if (!saved) return 'canceled';
    store.setValue('fileSession', 'savedRevision', before.project.revision);
    store.setValue('fileSession', 'needsSaveAs', false);
    return 'saved';
  } catch (error) {
    if (store.getState().ui.projectEpoch === before.ui.projectEpoch) store.setValue('fileSession', 'saveStatus', 'Save failed');
    throw error;
  } finally {
    store.setValue('fileSession', 'fileOperation', null);
  }
}
