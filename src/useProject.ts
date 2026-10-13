import { useEditorSelector, useEditorStore } from './editor/react';
export { AUTOSAVE_KEY } from './editor/store';

/** Project subscribers never receive playback or other UI-only updates. */
export function useProject() {
  const store = useEditorStore();
  const history = useEditorSelector(state => state.project);
  return {
    project: history.present, recoveryError: history.recoveryError,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    dispatch: store.dispatch,
  };
}
