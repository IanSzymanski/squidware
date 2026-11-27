import { setTiming } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import { strideLevel, type StrideLevel } from '../neighborPaths';
import type { Point, Project } from '../types';

export interface PreviewStrides {
  /** Performers whose step into this set would be large or beyond the production's limit. */
  levels: Record<string, Exclude<StrideLevel, 'ok'>>;
  /** The largest step anyone would take, in yards per count. */
  stride: number;
  level: StrideLevel;
  counts: number;
}

/**
 * What a previewed arrangement asks of the move into this set: each performer's straight-line step from the previous
 * set to the previewed spot. The opening set has no move, so it has nothing to report.
 */
export function previewStrides(project: Project, index: number, ids: readonly string[], positions: Record<string, Point>): PreviewStrides | null {
  if (index <= 0) return null;
  const from = project.sets[index - 1]?.positions, counts = setTiming(project, index).counts;
  if (!from || counts <= 0) return null;
  const limit = project.analysisRules?.defaults?.maximumStride ?? DEFAULT_ANALYSIS_RULES.maximumStride;
  const levels: PreviewStrides['levels'] = {};
  let stride = 0;
  for (const id of ids) {
    const a = from[id], b = positions[id];
    if (!a || !b) continue;
    const step = Math.hypot(b.x - a.x, b.y - a.y) / counts, level = strideLevel(step, limit);
    stride = Math.max(stride, step);
    if (level !== 'ok') levels[id] = level;
  }
  return { levels, stride, level: strideLevel(stride, limit), counts };
}
