import { describe, expect, it } from 'vitest';
import { analyzeTransition, createBlankProject, parseProject, serializeProject } from '../domain';
import type { Project, ProjectAnalysisRules } from '../types';
import { validateAnalysisRules, resolveAnalysisRules } from './rules';
import { transitionInput } from './input';
import { TransitionAnalyzer } from './engine';
import { createEditorStore } from '../editor/store';
import { validatePreferences } from '../preferences';
export function rulesFixture(): Project {
  const p = createBlankProject(); p.sections = [{ id: 'brass', name: 'Brass', color: '#aabbcc' }, { id: 'winds', name: 'Winds', color: '#ccbbff' }];
  p.performers = [{ id: 'a', label: 'A1', name: '', sectionId: 'brass' }, { id: 'b', label: 'B1', name: '', sectionId: 'winds' }];
  p.sets = [0,1,2].map(i => ({ id: `s${i}`, name: `Picture ${i + 1}`, notes: '', positions: { a: { x: 10 + i * 8, y: 10 }, b: { x: 10 + i * 8, y: 11.5 } } }));
  p.moves = [0,1].map(i => ({ id: `m${i}`, fromSetId: `s${i}`, toSetId: `s${i + 1}`, counts: 8, tempo: 120, transition: 'linear', paths: {} }));
  return p;
}
const sectionRules: ProjectAnalysisRules = { defaults: { minimumSpacing: 1, maximumStride: 1.25 }, sections: [{ sectionId: 'brass', minimumSpacing: 2, maximumStride: .75 }] };
async function compare(p: Project, engine = new TransitionAnalyzer()) {
  const result = (await engine.analyze(transitionInput(p, 1, 0)!, undefined, async () => {}))!;
  expect(result.issues).toEqual(analyzeTransition(p, 1)); return result;
}
describe('portable production analysis rules', () => {
  it('retains historical numeric defaults and uses a shared resolver for mixed-section outcomes and explanations', async () => {
    const p = rulesFixture(); expect((await compare(p)).issues).toEqual([]);
    p.analysisRules = sectionRules;
    const issues = (await compare(p)).issues;
    expect(issues.map(i => i.type).sort()).toEqual(['collision', 'stride']);
    expect(issues.find(i => i.type === 'stride')!.performerIds).toEqual(['a']);
    expect(issues.find(i => i.type === 'stride')!.message).toContain('Limit 0.75 yd/count');
    expect(issues.find(i => i.type === 'collision')!.message).toContain('Minimum 2 yd (Brass');
    expect(issues.every(i => i.message.includes('direction unknown'))).toBe(true);
  });
  it('applies production direction and section direction values only to explicit declarations, never travel vectors', async () => {
    const p = rulesFixture(); p.analysisRules = { ...sectionRules, directions: { backward: { minimumSpacing: 3, maximumStride: .5 } }, sections: [{ ...sectionRules.sections![0], directions: { backward: { maximumStride: .4 } } }] };
    expect(resolveAnalysisRules(p, 0, p.performers[0])).toMatchObject({ direction: 'unknown', minimumSpacing: 2, maximumStride: .75 });
    const mirrored = { ...p, sets: p.sets.map((s,i) => ({ ...s, positions: { a: { x: 90 - 8*i, y: 10 }, b: { x: 90 - 8*i, y: 11.5 } } })) };
    expect(resolveAnalysisRules(mirrored, 0, p.performers[0]).direction).toBe('unknown');
    p.moves[0].marchingDirections = { a: 'backward' };
    expect(resolveAnalysisRules(p, 0, p.performers[0])).toMatchObject({ direction: 'backward', minimumSpacing: 3, maximumStride: .4 });
    expect(resolveAnalysisRules(p, 0, p.performers[1])).toMatchObject({ direction: 'unknown', minimumSpacing: 1, maximumStride: 1.25 });
    const flags = (await compare(p)).issues; expect(flags.find(i => i.type === 'stride')!.severity).toBe('danger');
    expect(flags.find(i => i.type === 'stride')!.message).toContain('backward declared');
    const reopened = parseProject(serializeProject(p)); expect(analyzeTransition(reopened, 1)).toEqual(flags);
  });
  it('uses the larger spacing minimum for broad-phase search and changes severity against the applied threshold', async () => {
    const p = rulesFixture(); p.analysisRules = { defaults: { minimumSpacing: .1, maximumStride: 5 }, sections: [{ sectionId: 'brass', minimumSpacing: 4 }] };
    const result = await compare(p); expect(result.stats.exactPairs).toBe(1);
    expect(result.issues).toHaveLength(1); expect(result.issues[0].severity).toBe('danger');
    p.analysisRules.sections![0].minimumSpacing = 1.5; expect((await compare(p)).issues).toHaveLength(0);
    p.moves[0].transition = 'ease'; p.analysisRules.defaults.maximumStride = 1.25;
    expect((await compare(p)).issues.filter(i => i.type === 'stride')).toHaveLength(2);
  });
  it('invalidates cached results for effective rule edits, section changes and direction declarations even when broad-phase maxima stay unchanged', async () => {
    const p = rulesFixture(), engine = new TransitionAnalyzer();
    p.analysisRules = { ...sectionRules, sections: [...sectionRules.sections!, { sectionId: 'winds', minimumSpacing: 4 }] };
    await compare(p, engine); expect((await compare(p, engine)).stats.mode).toBe('cached');
    const edited = structuredClone(p); edited.analysisRules!.sections![0].minimumSpacing = 3;
    expect(transitionInput(edited,1,0)!.minimumSpacing).toBe(transitionInput(p,1,0)!.minimumSpacing);
    expect((await compare(edited, engine)).stats.mode).toBe('full');
    const reassigned = { ...p, performers: p.performers.map(person => ({ ...person, sectionId: 'winds' })) };
    expect((await compare(reassigned, engine)).stats.mode).toBe('full');
    const declared = structuredClone(p); declared.moves[0].marchingDirections = { a: 'forward' };
    expect((await compare(declared, engine)).stats.mode).toBe('full');
    expect((await compare(p, engine)).stats.mode).toBe('full');
  });
  it('saves combined rules and declarations in one atomic undoable command, with unchanged geometry and cross-client outcomes', () => {
    const p = rulesFixture(), store = createEditorStore(p); const geometry = store.getState().project.present.sets;
    expect(store.dispatch('analysis.rules-save', { rules: sectionRules, declaration: { index: 1, ids: ['a'], direction: 'backward' } })).toBe(true);
    const saved = store.getState().project.present;
    expect(saved.sets).toBe(geometry); expect(store.getState().project.past).toHaveLength(1);
    expect(saved.moves[0].marchingDirections).toEqual({ a: 'backward' });
    const other = createEditorStore(parseProject(serializeProject(saved)));
    other.setValue('preferences', 'value', validatePreferences({ minimumSpacing: 5, maximumStride: .1 }));
    expect(analyzeTransition(other.getState().project.present, 1)).toEqual(analyzeTransition(saved, 1));
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(saved);
    expect(store.dispatch('analysis.rules-save', { rules: sectionRules, declaration: { index: 0, ids: ['a'], direction: 'forward' } })).toBe(false);
    expect(store.getState().project.present).toEqual(saved); expect(store.getState().project.past).toHaveLength(1);
  });
  it('prunes removed performers, clears declarations on rewired moves and preserves them through count edits and undo', () => {
    const p = rulesFixture(); p.moves[0].marchingDirections = { a: 'forward', b: 'sideways' }; const store = createEditorStore(p);
    store.dispatch('set.update', { index: 1, update: { counts: 9 } }); expect(store.getState().project.present.moves[0].marchingDirections).toEqual(p.moves[0].marchingDirections);
    store.dispatch('performers.remove', { ids: ['a'] }); expect(store.getState().project.present.moves[0].marchingDirections).toEqual({ b: 'sideways' });
    store.dispatch('history.undo'); store.dispatch('set.create', { index: 0, kind: 'hold', counts: 4 });
    expect(store.getState().project.present.moves.find(m => m.id === 'm0')!.marchingDirections).toBeUndefined();
    store.dispatch('history.undo'); expect(store.getState().project.present.moves[0].marchingDirections).toEqual(p.moves[0].marchingDirections);
  });
  it('rejects invalid rules or declarations without replacing a valid project', () => {
    const p = rulesFixture(), store = createEditorStore(p);
    for (const bad of [null, { defaults: { minimumSpacing: .01, maximumStride: 1 } }, { defaults: { minimumSpacing: 1, maximumStride: NaN } }, { ...sectionRules, sections: [{ sectionId: 'missing', minimumSpacing: 2 }] }, { ...sectionRules, sections: [sectionRules.sections![0], sectionRules.sections![0]] }, { ...sectionRules, directions: { north: { minimumSpacing: 1 } } }]) {
      expect(() => validateAnalysisRules(bad, new Set(['brass','winds']))).toThrow(/analysisRules/);
      expect(store.dispatch('analysis.rules-save', { rules: bad as ProjectAnalysisRules })).toBe(false);
      expect(store.getState().project.present).toEqual(p);
    }
    for (const marchingDirections of [{ missing: 'backward' }, { a: 'north' }, null]) expect(() => parseProject(JSON.stringify({ ...p, moves: [{ ...p.moves[0], marchingDirections }, p.moves[1]] }))).toThrow(/marchingDirections/);
  });
});
