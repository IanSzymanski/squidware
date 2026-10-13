import { describe, expect, it } from 'vitest';
import { createBlankProject, parseProject, PROJECT_LIMITS, serializeProject, setCountLimits, validateProject, validateSetUpdate } from './domain';
import { numberDraftError } from './components/NumberField';

describe('shared project editing limits', () => {
  it('round-trips boundary timing and sections without clamping other values', () => {
    const project = createBlankProject();
    project.sections = Array.from({ length: PROJECT_LIMITS.sections }, (_, index) => ({ id: `section-${index}`, name: `Section ${index}`, color: '#abcdef' }));
    project.openingTiming.tempo = 20.125;
    project.sets.push(
      { ...project.sets[0], id: 'min' },
      { ...project.sets[0], id: 'max' },
    );
    project.moves = [
      { id: 'min-move', fromSetId: project.sets[0].id, toSetId: 'min', counts: PROJECT_LIMITS.counts.min, tempo: PROJECT_LIMITS.tempo.min, transition: 'linear', paths: {} },
      { id: 'max-move', fromSetId: 'min', toSetId: 'max', counts: PROJECT_LIMITS.counts.max, tempo: PROJECT_LIMITS.tempo.max, transition: 'ease', paths: {} },
    ];
    project.sets[2].name = 'S'.repeat(PROJECT_LIMITS.text.setName);
    project.sets[2].notes = 'N'.repeat(PROJECT_LIMITS.text.notes);
    for (const [index, set] of project.sets.entries()) validateSetUpdate(set, index);
    expect(parseProject(serializeProject(project))).toEqual(project);
    project.sections.push({ id: 'too-many', name: 'Extra', color: '#abcdef' });
    expect(() => validateProject(project)).toThrow(/sections must contain/);
  });

  it.each([0, 1025, 2.5, NaN, Infinity])('rejects invalid move count %s before a patch can be applied', counts => {
    expect(() => validateSetUpdate({ counts }, 1)).toThrow(/counts/);
  });
  it.each([19.99, 400.01, NaN, Infinity])('rejects invalid tempo %s before a patch can be applied', tempo => {
    expect(() => validateSetUpdate({ tempo }, 1)).toThrow(/tempo/);
  });
  it('allows only zero counts for the opening set', () => {
    expect(setCountLimits(0)).toEqual({ min: 0, max: 0 });
    expect(setCountLimits(1)).toEqual(PROJECT_LIMITS.counts);
    expect(() => validateSetUpdate({ counts: 0, tempo: 20.125 }, 0)).not.toThrow();
    expect(() => validateSetUpdate({ counts: 1 }, 0)).toThrow(/sets\[0\].counts/);
  });
});

describe('numeric field drafts', () => {
  it.each(['', ' ', 'NaN', 'Infinity', '0', '1025', '1.5'])('reports invalid count draft %j without clamping', draft => {
    expect(numberDraftError(draft, PROJECT_LIMITS.counts.min, PROJECT_LIMITS.counts.max, true)).toBeDefined();
  });
  it.each(['1', '1024'])('accepts boundary count %s', draft => {
    expect(numberDraftError(draft, PROJECT_LIMITS.counts.min, PROJECT_LIMITS.counts.max, true)).toBeUndefined();
  });
  it('preserves valid fractional tempo and exact coordinates', () => {
    expect(numberDraftError('20.125', PROJECT_LIMITS.tempo.min, PROJECT_LIMITS.tempo.max)).toBeUndefined();
    expect(numberDraftError('53.333333333333336', 0, 160 / 3)).toBeUndefined();
  });
});
