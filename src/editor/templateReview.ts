import { formationAssignmentOrder, formationCenter } from '../formationAssignment';
import { previewFormationTemplate } from '../templates/formations';
import type { TemplatePlacement } from '../templates/formations';
import type { FormationTemplate } from '../templates/library';
import { canEditPositions } from './editMode';
import type { EditorState } from './state';

export interface TemplateReview {
  revision: number; epoch: number; setId: string; ids: string[];
  template: FormationTemplate; placement: TemplatePlacement;
  assignmentRotation: number;
}
export function beginTemplateReview(state: EditorState, template: FormationTemplate): TemplateReview {
  const selected = new Set(state.selection.selectedIds);
  const ids = state.project.present.performers.filter(p => selected.has(p.id)).map(p => p.id);
  const set = state.project.present.sets[state.selection.activeIndex];
  return { revision: state.project.revision, epoch: state.ui.projectEpoch, setId: set.id, ids, template,
    placement: { center: ids.length ? formationCenter(set.positions, ids) : { x: state.project.present.field.width / 2, y: state.project.present.field.height / 2 }, rotation: 0, assignment: 'position' }, assignmentRotation: 0 };
}
export function templateReviewError(state: EditorState, review: TemplateReview): string | null {
  if (review.revision !== state.project.revision || review.epoch !== state.ui.projectEpoch || review.setId !== state.project.present.sets[state.selection.activeIndex]?.id) return 'The production changed after preview. Choose the template again to review the current set.';
  const selected = new Set(state.selection.selectedIds);
  const ids = state.project.present.performers.filter(p => selected.has(p.id)).map(p => p.id);
  if (!ids.length) return 'Select performers on the field before applying a saved formation. Close Templates to select dots or a section.';
  if (!Array.isArray(review.ids) || ids.length !== review.ids.length || ids.some((id, i) => id !== review.ids[i])) return 'The selection changed. Choose the template again with the intended performers selected.';
  if (!canEditPositions(state) || state.project.transactionName || state.fileSession.fileOperation) return 'Pause at a set with full-show editing before applying a template.';
  return null;
}
export function templateReviewResult(state: EditorState, review: TemplateReview) {
  const positions = state.project.present.sets[state.selection.activeIndex].positions;
  const geometry = review.template.geometry;
  // Ordering uses the orientation at explicit assignment, not each rotation frame.
  const order = formationAssignmentOrder(positions, review.ids, geometry.kind === 'parametric' ? geometry.shape : 'line', {
    ...review.placement, rotation: review.assignmentRotation, width: 1, height: 0, columns: geometry.kind === 'parametric' ? geometry.columns : 1,
  });
  return previewFormationTemplate(review.template, positions, review.ids, state.project.present.field, review.placement, order);
}
