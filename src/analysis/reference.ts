import { compileTrack, detailedCollision, detailedStride } from './detailed';
import { PROJECT_LIMITS } from '../projectValidation';
import { resolveAnalysisRules } from './rules';
import type { AnalysisInput } from './input';
import type { AnalysisThresholds, Project, TransitionIssue } from '../types';
function finish<T>(work: Generator<void, T>): T { let next = work.next(); while (!next.done) next = work.next(); return next.value; }
/** Synchronous reference API, without worker caches or broad-phase pruning.
 * Production editor/gesture consumers always use the cancellable worker. */
export function referenceDetailedTransition(project: Project, index: number, base?: Partial<AnalysisThresholds>): TransitionIssue[] {
  const m = project.moves[index - 1], a = project.sets[index - 1], b = project.sets[index];
  const tracks = project.performers.map(p => ({ id: p.id, label: p.label, from: a.positions[p.id], to: b.positions[p.id], path: m.paths[p.id], ...resolveAnalysisRules(project, index - 1, p, base) }));
  const input: AnalysisInput = { projectKey: project.id, moveId: m.id, modelKey: 'reference', counts: m.counts, tempo: m.tempo, transition: m.transition,
    startCount: project.moves.slice(0, index - 1).reduce((n, m) => n + m.counts, 0),
    minimumSpacing: Math.max(PROJECT_LIMITS.analysisThreshold.min, ...tracks.map(t => t.minimumSpacing)), maximumStride: Math.max(PROJECT_LIMITS.analysisThreshold.min, ...tracks.map(t => t.maximumStride)), tracks, detailedPaths: true };
  const shapes = tracks.map(t => compileTrack(t, m.counts, m.transition)), issues: TransitionIssue[] = [];
  tracks.forEach((t, i) => { const issue = finish(detailedStride(input, t, shapes[i])); if (issue) issues.push(issue); });
  for (let a = 0; a < tracks.length; a++) for (let b = a + 1; b < tracks.length; b++) {
    const issue = finish(detailedCollision(input, tracks[a], tracks[b], shapes[a], shapes[b])); if (issue) issues.push(issue);
  }
  return issues.sort((a, b) => a.severity === b.severity ? (a.atCount ?? 0) - (b.atCount ?? 0) : a.severity === 'danger' ? -1 : 1);
}
