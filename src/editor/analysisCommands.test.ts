import { describe, expect, it } from 'vitest';
import { createBlankProject } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import type { Project, ProjectAnalysisRules } from '../types';
import { sameAnalysisRules } from './analysisCommands';
import { createEditorStore } from './store';

function fixture(): Project {
  const p = createBlankProject(); p.sections = [{ id: 'brass', name: 'Brass', color: '#aabbcc' }, { id: 'winds', name: 'Winds', color: '#ccbbff' }];
  p.performers = [{ id: 'a', label: 'A1', name: '', sectionId: 'brass' }, { id: 'b', label: 'B1', name: '', sectionId: 'winds' }];
  p.sets = [0, 1].map(i => ({ id: `s${i}`, name: `Picture ${i + 1}`, notes: '', positions: { a: { x: 10 + i * 8, y: 10 }, b: { x: 10 + i * 8, y: 12 } } }));
  p.moves = [{ id: 'm0', fromSetId: 's0', toSetId: 's1', counts: 8, tempo: 120, transition: 'linear', paths: {} }];
  return p;
}
const defaults = (): ProjectAnalysisRules => ({ defaults: { ...DEFAULT_ANALYSIS_RULES } });

describe('unchanged analysis rules', () => {
  it('compares by effect: absent rules equal the defaults; empty overrides and section order do not count', () => {
    expect(sameAnalysisRules(undefined, defaults())).toBe(true);
    expect(sameAnalysisRules({ defaults: { maximumStride: 1.25, minimumSpacing: 1 } }, undefined)).toBe(true);
    expect(sameAnalysisRules({ ...defaults(), directions: { forward: {} }, sections: [{ sectionId: 'brass' }, { sectionId: 'winds', directions: { sideways: {} } }] }, undefined)).toBe(true);
    const two: ProjectAnalysisRules = { ...defaults(), sections: [{ sectionId: 'brass', minimumSpacing: 2 }, { sectionId: 'winds', maximumStride: .5 }] };
    expect(sameAnalysisRules(two, { ...two, sections: [...two.sections!].reverse() })).toBe(true);
    expect(sameAnalysisRules({ defaults: { minimumSpacing: 1.5, maximumStride: 1.25 } }, undefined)).toBe(false);
    expect(sameAnalysisRules({ ...defaults(), directions: { backward: { maximumStride: .5 } } }, undefined)).toBe(false);
    expect(sameAnalysisRules(two, { ...two, sections: [two.sections![0]] })).toBe(false);
    expect(sameAnalysisRules({ ...defaults(), sections: [{ sectionId: 'brass', directions: { forward: { minimumSpacing: 2 } } }] }, { ...defaults(), sections: [{ sectionId: 'brass', directions: { backward: { minimumSpacing: 2 } } }] })).toBe(false);
  });

  it('saving unchanged rules creates no history or explicit default; a declaration alone keeps the stored rules', () => {
    const p = fixture(), store = createEditorStore(p), present = store.getState().project.present, revision = store.getState().project.revision;
    expect(store.dispatch('analysis.rules-save', { rules: defaults() })).toBe(true);
    expect(store.getState().project.present).toBe(present); expect(store.getState().project.past).toHaveLength(0); expect(store.getState().project.revision).toBe(revision);
    expect(store.dispatch('analysis.rules-save', { rules: defaults(), declaration: { index: 1, ids: ['a'], direction: 'forward' } })).toBe(true);
    const declared = store.getState().project.present;
    expect(declared.analysisRules).toBeUndefined(); expect(declared.moves[0].marchingDirections).toEqual({ a: 'forward' }); expect(store.getState().project.past).toHaveLength(1);
    expect(store.dispatch('analysis.rules-save', { rules: { defaults: { minimumSpacing: 2, maximumStride: 1.25 } } })).toBe(true);
    expect(store.getState().project.present.analysisRules).toEqual({ defaults: { minimumSpacing: 2, maximumStride: 1.25 } }); expect(store.getState().project.past).toHaveLength(2);
    expect(store.dispatch('analysis.rules-save', { rules: { defaults: { minimumSpacing: 2, maximumStride: 1.25 } } })).toBe(true);
    expect(store.getState().project.past).toHaveLength(2);
  });
});
