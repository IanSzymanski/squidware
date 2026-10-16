import type { EditorState } from './state';
import { previewExactTransform } from '../transforms';
import { selectionMembership } from '../selection';

export function transformSessionCurrent(state: EditorState): boolean {
  const session = state.ui.transformPreview; if (!session) return false;
  const project = state.project.present; const index = state.selection.activeIndex;
  const selected = selectionMembership(state.selection.selectedIds);
  const start = project.moves.slice(0, index).reduce((sum, move) => sum + move.counts, 0);
  return session.revision === state.project.revision && session.setId === project.sets[index]?.id
    && !state.playback.playing && !state.project.transactionName && Math.abs(state.playback.count - start) < .001
    && state.ui.workspace === 'design' && state.ui.view === '2d' && !state.ui.dialog
    && session.ids.length === state.selection.selectedIds.length && session.ids.every(id => selected.has(id));
}
export function currentTransformResult(state: EditorState) {
  const session = state.ui.transformPreview;
  return session && transformSessionCurrent(state) ? previewExactTransform(state.project.present.sets[state.selection.activeIndex].positions, session.ids, session.options, state.project.present.field) : null;
}
