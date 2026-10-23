import { PROJECT_LIMITS } from '../projectValidation';
import { setStartCount } from '../domain';
import { resolveAnalysisRules } from './rules';
import type { ResolvedAnalysisRules } from './rules';
import type { Point, Project, TransitionIssue } from '../types';

export interface AnalysisRules { minimumSpacing: number; maximumStride: number }
export interface Track extends ResolvedAnalysisRules { id: string; label: string; from: Point; to: Point }
export interface AnalysisInput extends AnalysisRules {
  projectKey: string; moveId: string; modelKey: string;
  counts: number; tempo: number; transition: 'linear' | 'ease'; startCount: number;
  tracks: Track[];
}
export interface AnalysisStats {
  mode: 'full' | 'incremental' | 'cached'; changedPerformers: number;
  possiblePairs: number; exactPairs: number; elapsedMs: number;
}
export interface AnalysisResult { issues: TransitionIssue[]; stats: AnalysisStats }
export type AnalysisRequest = { revision: number; input: AnalysisInput | null };
export type AnalysisResponse = { revision: number; result: AnalysisResult } | { revision: number; error: string };

/** Only the selected move crosses the worker boundary, never the whole show. */
export function transitionInput(project: Project, index: number, epoch: number, rules?: AnalysisRules): AnalysisInput | null {
  if (index < 1 || index >= project.sets.length) return null;
  const move = project.moves[index - 1], previous = project.sets[index - 1], destination = project.sets[index];
  const tracks = project.performers.map(p => ({ id: p.id, label: p.label, from: previous.positions[p.id], to: destination.positions[p.id], ...resolveAnalysisRules(project, index - 1, p, rules) }));
  return { projectKey: `${epoch}:${project.id}`, moveId: move.id,
    modelKey: JSON.stringify([project.schemaVersion, project.field, move.fromSetId, move.toSetId, move.paths, project.analysisRules, move.marchingDirections]),
    counts: move.counts, tempo: move.tempo, transition: move.transition, startCount: setStartCount(project, index - 1),
    minimumSpacing: Math.max(PROJECT_LIMITS.analysisThreshold.min, ...tracks.map(t => t.minimumSpacing)), maximumStride: Math.max(PROJECT_LIMITS.analysisThreshold.min, ...tracks.map(t => t.maximumStride)),
    tracks };
}
