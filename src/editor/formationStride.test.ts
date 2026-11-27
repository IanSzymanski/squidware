import { describe, expect, it } from 'vitest';
import { createDemoProject, setTiming } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import { previewStrides } from './formationStride';

describe('preview strides', () => {
  const project = createDemoProject();
  const ids = project.performers.map(performer => performer.id);
  const previous = project.sets[0].positions;
  const counts = setTiming(project, 1).counts;
  const limit = project.analysisRules?.defaults?.maximumStride ?? DEFAULT_ANALYSIS_RULES.maximumStride;

  it('has nothing to report for the opening set', () => {
    expect(previewStrides(project, 0, ids, previous)).toBeNull();
  });

  it('reads a preview that keeps everyone in place as a hold', () => {
    expect(previewStrides(project, 1, ids, previous)).toEqual({ levels: {}, stride: 0, level: 'ok', counts });
  });

  it('flags only the performers whose step from the previous set is large or over the limit', () => {
    const [near, over, fine] = ids;
    const moved = (id: string, stride: number) => ({ x: previous[id].x + stride * counts, y: previous[id].y });
    const result = previewStrides(project, 1, ids, { ...previous, [near]: moved(near, limit * .8), [over]: moved(over, limit * 1.2), [fine]: moved(fine, limit * .5) })!;
    expect(result.levels).toEqual({ [near]: 'large', [over]: 'over' });
    expect(result.level).toBe('over');
    expect(result.stride).toBeCloseTo(limit * 1.2);
  });

  it('ignores performers the preview does not place', () => {
    expect(previewStrides(project, 1, ['missing'], previous)).toEqual({ levels: {}, stride: 0, level: 'ok', counts });
  });
});
