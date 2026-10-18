import type { EditorState } from './state';
import { previewSpacing } from '../spacing';
import { selectionMembership } from '../selection';

export function spacingSessionCurrent(state: EditorState): boolean {
  const session = state.ui.spacingPreview; if (!session) return false;
  const project = state.project.present; const index = state.selection.activeIndex;
  const selected = selectionMembership(state.selection.selectedIds);
  const start = project.moves.slice(0, index).reduce((sum, move) => sum + move.counts, 0);
  return session.revision === state.project.revision && session.setId === project.sets[index]?.id
    && !state.playback.playing && !state.project.transactionName && Math.abs(state.playback.count - start) < .001
    && state.ui.workspace === 'design' && state.ui.view === '2d' && !state.ui.dialog
    && !state.ui.transformPreview && !state.ui.formationPreview
    && session.ids.length === state.selection.selectedIds.length && session.ids.every(id => selected.has(id));
}
export function currentSpacingResult(state: EditorState) {
  const session = state.ui.spacingPreview; const project = state.project.present;
  return session && spacingSessionCurrent(state) ? previewSpacing(project.sets[state.selection.activeIndex].positions, session.ids, session.options, project.field, project) : null;
}
