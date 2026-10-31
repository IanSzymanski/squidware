import { pasteIntervals, reversePaths } from '../movementPathOperations';
import { updateSetProperties } from './projectEdits';
import type { MovementClipboard, PasteOptions } from '../movementPathOperations';
import type { Project } from '../types';
export interface PathReviewContext { moveId: string; activeSetId: string; ids: string[]; revision: number; epoch: number }
export type PathOperation = { kind: 'resize'; counts: number } | { kind: 'reverse' } | { kind: 'paste'; clipboardId: string; options: PasteOptions };
export interface PathOperationRequest extends PathReviewContext { operation: PathOperation }
export interface PathCopyRequest extends PathReviewContext { performerId: string; segmentIds: string[]; wholeMove: boolean }
export function pathOperationPlan(project: Project, request: PathOperationRequest, clipboard: MovementClipboard | null) {
  const index = project.moves.findIndex(m => m.id === request.moveId);
  if (index < 0) throw Error('The reviewed move no longer exists.');
  const op = request.operation;
  if (op.kind === 'resize') return { project: updateSetProperties(project, index + 1, { counts: op.counts }), summary: `Rescale every authored interval from ${project.moves[index].counts} to ${op.counts} counts. Geometry and interval IDs stay fixed; no trimming.` };
  if (op.kind === 'reverse') return { project: reversePaths(project, index, request.ids), summary: `Reverse ${request.ids.length} selected paths and swap their positions in both endpoint pictures. Adjacent moves may change; show timing and set order stay fixed.` };
  if (!clipboard || op.clipboardId !== clipboard.id || clipboard.epoch !== request.epoch) throw Error('Copy an interval range in this production before pasting.');
  if (request.ids.length !== 1 || request.ids[0] !== op.options.performerId) throw Error('Select exactly one destination performer explicitly.');
  const result = pasteIntervals(project, index, clipboard, op.options);
  return { project: result.project, summary: `Replace ${result.replaced} destination intervals. Geometry scale ${result.scale.toFixed(4)}×; rotation ${result.rotation.toFixed(2)}°. Uses the destination move’s ${project.moves[index].transition === 'ease' ? 'eased' : 'linear'} timing. New interval IDs; destination performer identity stays fixed.` };
}
