import { previewFormation } from '../formationPreview';
import type { EditorState } from './state';
import { isAtActiveSet } from './editMode';

export function formationSessionCurrent(state: EditorState): boolean {
  const session = state.ui.formationPreview;
  if (!session) return false;
  const selected = new Set(state.selection.selectedIds);
  return session.revision === state.project.revision && session.setId === state.project.present.sets[state.selection.activeIndex]?.id
    && !state.playback.playing && !state.project.transactionName && isAtActiveSet(state)
    && state.ui.workspace === 'design' && state.ui.view === '2d' && !state.ui.dialog && !state.ui.transformPreview
    && session.ids.length === selected.size && session.ids.every(id => selected.has(id));
}
export function currentFormationResult(state: EditorState) {
  const session = state.ui.formationPreview;
  return session && formationSessionCurrent(state) ? previewFormation(state.project.present.sets[state.selection.activeIndex].positions, session.ids, session.kind, session.options, state.project.present.field, session.order) : null;
}
