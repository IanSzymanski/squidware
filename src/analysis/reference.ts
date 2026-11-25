import { compileTrack, detailedCollision, detailedStride } from './detailed';
import { clearanceFindings } from './clearance';
import { transitionInput } from './input';
import type { AnalysisThresholds, Project, TransitionIssue } from '../types';
function finish<T>(work: Generator<void, T>): T { let next = work.next(); while (!next.done) next = work.next(); return next.value; }
/** Synchronous reference API, without worker caches or broad-phase pruning.
 * Production editor/gesture consumers always use the cancellable worker. */
export function referenceDetailedTransition(project: Project, index: number, base?: Partial<AnalysisThresholds>): TransitionIssue[] {
  const input = transitionInput(project, index, 0, base)!;
  const { tracks, counts, transition } = input;
  const shapes = tracks.map(t => compileTrack(t, counts, transition)), issues: TransitionIssue[] = [];
  tracks.forEach((t, i) => { const issue = finish(detailedStride(input, t, shapes[i])); if (issue) issues.push(issue); });
  for (let a = 0; a < tracks.length; a++) for (let b = a + 1; b < tracks.length; b++) {
    const issue = finish(detailedCollision(input, tracks[a], tracks[b], shapes[a], shapes[b])); if (issue) issues.push(issue);
  }
  for (const issue of finish(clearanceFindings(input, shapes))) issues.push(issue);
  return issues.sort((a, b) => a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1);
}

export function referenceClearance(project: Project, index: number): TransitionIssue[] {
  if (!project.clearanceRules || !project.stagingObjects?.length) return [];
  const input = transitionInput(project, index, 0);
  if (!input) return [];
  return finish(clearanceFindings(input)).sort((a, b) => a.severity === b.severity ? a.atCount! - b.atCount! : a.severity === 'danger' ? -1 : 1);
}
