import type { EditorState } from './state';
import { previewCoordinateEntry } from '../drillEntry';
import { isAtActiveSet } from './editMode';

export function coordinateSessionCurrent(state: EditorState): boolean {
  const session=state.ui.coordinatePreview; if(!session)return false;
  const selected=new Set(state.selection.selectedIds);
  return session.revision===state.project.revision && session.setId===state.project.present.sets[state.selection.activeIndex]?.id
    && !state.playback.playing && !state.project.transactionName && isAtActiveSet(state)
    && state.ui.workspace==='design' && state.ui.view==='2d' && !state.ui.dialog
    && !state.ui.transformPreview && !state.ui.formationPreview && !state.ui.spacingPreview
    && session.ids.length===selected.size && session.ids.every(id=>selected.has(id));
}
export function currentCoordinateResult(state: EditorState) {
  const session=state.ui.coordinatePreview;
  return session && coordinateSessionCurrent(state) ? previewCoordinateEntry(state.project.present.sets[state.selection.activeIndex].positions,session.ids,session.options,state.project.present) : null;
}
