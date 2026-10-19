import { setStartCount } from '../domain';
import type { EditorState } from './state';

/** Keep command enablement and the visible field lock on the same arrival tolerance. */
export function isAtActiveSet(state: EditorState): boolean {
  return Math.abs(state.playback.count - setStartCount(state.project.present, state.selection.activeIndex)) < 0.001;
}

export function canEditPositions(state: EditorState): boolean {
  return !state.ui.selectionPreview && !state.playback.playing && isAtActiveSet(state) && !state.ui.transformPreview && !state.ui.formationPreview && !state.ui.spacingPreview && !state.ui.coordinatePreview;
}
