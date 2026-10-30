import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1 from '../fixtures/schema-v1.squid?raw';
import { parseProject, serializeProject, setStartCount, totalCounts, validateProject } from '../domain';
import { PrintOutput } from '../components/PrintOutput';
import { createEditorStore, recoverProject } from './store';

const fixture = () => parseProject(v1);
const withPath = () => {
  const project = fixture();
  project.moves[0].paths.a = { segments: [{ id: 'line-a', kind: 'line', startCount: 0, endCount: 16 }] };
  return project;
};

describe('canonical v2 command and recovery integration', () => {
  it('loads legacy content and saves only v2 without changing existing identities', () => {
    const project = fixture();
    const store = createEditorStore(project);
    expect(store.getState().project.present.schemaVersion).toBe(2);
    store.dispatch('set.update', { index: 1, update: { name: 'Renamed', notes: 'New notes' } });
    const saved = parseProject(serializeProject(store.getState().project.present));
    expect(saved.sets.map(set => set.id)).toEqual(project.sets.map(set => set.id));
    expect(saved.moves).toEqual(project.moves);
    expect(saved.sets[1].positions).toEqual(project.sets[1].positions);
    expect(saved.sets[1].name).toBe('Renamed');
    expect(saved.sets.every(set => !Object.hasOwn(set, 'counts') && !Object.hasOwn(set, 'tempo'))).toBe(true);
  });

  it('edits move timing, resizes explicit segments and restores identities through undo/redo', () => {
    const initial = withPath();
    const store = createEditorStore(initial);
    store.dispatch('set.select', { index: 1 });
    expect(store.dispatch('set.update', { index: 1, update: { counts: 24, tempo: 156.25, transition: 'linear' } })).toBe(true);
    const edited = store.getState().project.present;
    expect(edited.sets).toEqual(initial.sets);
    expect(edited.moves[0]).toMatchObject({ id: initial.moves[0].id, counts: 24, tempo: 156.25, transition: 'linear' });
    expect(edited.moves[0].paths.a.segments).toEqual([{ id: 'line-a', kind: 'line', startCount: 0, endCount: 24 }]);
    expect(store.getState().playback.count).toBe(24);
    expect(validateProject(edited)).toEqual(edited);
    store.dispatch('history.undo');
    expect(store.getState().project.present).toEqual(initial);
    store.dispatch('history.redo');
    expect(store.getState().project.present).toEqual(edited);
  });

  it('inserts a picture and rewires its successor while preserving existing moves', () => {
    const initial = withPath();
    const store = createEditorStore(initial);
    store.dispatch('set.create', { index: 0, kind: 'hold' });
    const next = store.getState().project.present;
    expect(next.sets).toHaveLength(4);
    expect(next.moves).toHaveLength(3);
    expect(next.sets[1].positions).toEqual(initial.sets[0].positions);
    expect(next.moves[0]).toMatchObject({ fromSetId: 'opening', toSetId: next.sets[1].id, counts: 32, tempo: 91.25, transition: 'linear' });
    expect(next.moves[1]).toEqual({ ...initial.moves[0], fromSetId: next.sets[1].id });
    expect(next.moves[2]).toEqual(initial.moves[1]);
    expect(new Set(next.moves.map(move => move.id)).size).toBe(3);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('removes a middle picture and reconnects the surviving arrival move', () => {
    const initial = fixture();
    const store = createEditorStore(initial);
    store.dispatch('set.remove', { index: 1 });
    const next = store.getState().project.present;
    expect(next.sets.map(set => set.id)).toEqual(['opening', 'arrival']);
    expect(next.moves).toEqual([{ ...initial.moves[1], fromSetId: 'opening' }]);
    expect(totalCounts(next)).toBe(24);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('removes the opening picture without assigning its incoming counts to playback', () => {
    const initial = fixture();
    const store = createEditorStore(initial);
    store.dispatch('set.remove', { index: 0 });
    const next = store.getState().project.present;
    expect(next.openingTiming).toEqual({ tempo: 132.5, transition: 'ease' });
    expect(next.moves).toEqual([initial.moves[1]]);
    expect(setStartCount(next, 0)).toBe(0);
    expect(totalCounts(next)).toBe(24);
    store.dispatch('set.remove', { index: 1 });
    expect(store.getState().project.present.moves).toEqual([]);
    expect(totalCounts(store.getState().project.present)).toBe(0);
    expect(parseProject(serializeProject(store.getState().project.present))).toEqual(store.getState().project.present);
  });

  it('reorders arrival pictures while timing and surviving move identities follow their destinations', () => {
    const initial = withPath();
    const store = createEditorStore(initial);
    store.dispatch('set.reorder', { index: 2, direction: -1 });
    const next = store.getState().project.present;
    expect(next.sets.map(set => set.id)).toEqual(['opening', 'arrival', 'crossing']);
    expect(next.moves.map(move => move.id)).toEqual([initial.moves[1].id, initial.moves[0].id]);
    expect(next.moves.map(move => [move.fromSetId, move.toSetId])).toEqual([['opening', 'arrival'], ['arrival', 'crossing']]);
    expect(next.moves[1].paths).toEqual(initial.moves[0].paths);
    expect(parseProject(serializeProject(next))).toEqual(next);
  });

  it('reorders an opening picture using the documented 32-count default when it becomes an arrival', () => {
    const initial = fixture();
    const store = createEditorStore(initial);
    store.dispatch('set.reorder', { index: 0, direction: 1 });
    const next = store.getState().project.present;
    expect(next.sets.map(set => set.id)).toEqual(['crossing', 'opening', 'arrival']);
    expect(next.openingTiming).toEqual({ tempo: 132.5, transition: 'ease' });
    expect(next.moves[0]).toMatchObject({ counts: 32, tempo: 91.25, transition: 'ease', fromSetId: 'crossing', toSetId: 'opening' });
    expect(next.moves[1]).toEqual({ ...initial.moves[1], fromSetId: 'opening' });
    expect(validateProject(next)).toEqual(next);
  });

  it('prunes removed performers from paths and positions, with undo restoring both', () => {
    const initial = withPath();
    const store = createEditorStore(initial);
    store.dispatch('performers.remove', { ids: ['a'] });
    const next = store.getState().project.present;
    expect(next.moves.every(move => !Object.hasOwn(move.paths, 'a'))).toBe(true);
    expect(next.sets.every(set => !Object.hasOwn(set.positions, 'a'))).toBe(true);
    expect(validateProject(next)).toEqual(next);
    store.dispatch('history.undo');
    expect(store.getState().project.present).toEqual(initial);
  });

  it('adds new performers with implicit lines while retaining authored paths', () => {
    const initial = withPath();
    const store = createEditorStore(initial);
    store.dispatch('performers.add', { performers: [{ id: 'c', label: 'C1', name: '', sectionId: 'brass' }] });
    const next = store.getState().project.present;
    expect(next.moves).toEqual(initial.moves);
    expect(next.sets.every(set => Object.hasOwn(set.positions, 'c'))).toBe(true);
    expect(validateProject(next)).toEqual(next);
  });

  it('recovers both wire versions as v2 and keeps unsupported recovery content intact', () => {
    const project = withPath();
    for (const content of [v1, serializeProject(project)]) {
      const storage = { getItem: () => content };
      const recovered = recoverProject(storage);
      expect(recovered.project.schemaVersion).toBe(2);
      expect(recovered.recoveryError).toBeUndefined();
      expect(serializeProject(recovered.project)).toBe(serializeProject(parseProject(content)));
    }
    const future = JSON.stringify({ schemaVersion: 5 });
    const storage = { getItem: () => future };
    const recovered = recoverProject(storage);
    expect(recovered.recoveryError).toMatch(/Update Squidware/);
    expect(storage.getItem()).toBe(future);
  });

  it('prints incoming timing from moves and opening zero counts with original picture notes', () => {
    const project = fixture();
    const charts = renderToStaticMarkup(<PrintOutput project={project} mode="charts" />);
    expect(charts.includes('16 counts into set')).toBe(true);
    expect(charts.includes('132.5 BPM')).toBe(true);
    expect(charts.includes('Opening picture; no elapsed counts.')).toBe(true);
    expect(charts.includes('0 counts into set')).toBe(true);
    const coordinates = renderToStaticMarkup(<PrintOutput project={project} mode="coordinates" />);
    expect(coordinates).toContain('<td>16</td>');
    expect(coordinates).toContain('<td>24</td>');
  });
});
