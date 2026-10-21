import { setStartCount } from '../domain';
import type { Point, Project, TransitionIssue } from '../types';

export interface AnalysisRules { minimumSpacing: number; maximumStride: number }
export interface Track { id: string; label: string; from: Point; to: Point }
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
export function transitionInput(project: Project, index: number, epoch: number, rules: AnalysisRules): AnalysisInput | null {
  if (index < 1 || index >= project.sets.length) return null;
  const move = project.moves[index - 1], previous = project.sets[index - 1], destination = project.sets[index];
  return { projectKey: `${epoch}:${project.id}`, moveId: move.id,
    modelKey: JSON.stringify([project.schemaVersion, project.field, move.fromSetId, move.toSetId, move.paths]),
    counts: move.counts, tempo: move.tempo, transition: move.transition, startCount: setStartCount(project, index - 1),
    minimumSpacing: rules.minimumSpacing, maximumStride: rules.maximumStride,
    tracks: project.performers.map(({ id, label }) => ({ id, label, from: previous.positions[id], to: destination.positions[id] })) };
}
