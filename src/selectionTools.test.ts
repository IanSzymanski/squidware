import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject, PROJECT_LIMITS } from './domain';
import { invertSelection, parseLassoPoints, previewSelection } from './selectionTools';
import { createEditorStore } from './editor/store';
import { projectV2AsLegacy } from './projectV2';

const positions = { a: { x: 10, y: 10 }, b: { x: 20, y: 10.2 }, c: { x: 30, y: 10.26 }, d: { x: 10.2, y: 20 }, e: { x: 30, y: 30 } };
const scope = Object.keys(positions);
const polygon = [{ x: 5, y: 5 }, { x: 20, y: 5 }, { x: 20, y: 15 }, { x: 5, y: 15 }];
function fixture() {
  const project = createDemoProject();
  project.performers = scope.map((id, i) => ({ id, label: id.toUpperCase(), name: '', sectionId: project.sections[i < 3 ? 0 : 1].id }));
  project.sets = project.sets.map(set => ({ ...set, positions: structuredClone(positions) }));
  project.moves = project.moves.map(move => ({ ...move, paths: {} }));
  return project;
}

describe('geometric selection and saved groups', () => {
  it('inverts only the documented visible scope and preserves hidden selections', () => {
    expect(invertSelection(['hidden', 'a'], ['a', 'b'])).toEqual(['hidden', 'b']);
    expect(invertSelection(['hidden'], [])).toEqual(['hidden']);
  });
  it('previews irregular rank/file axes inclusively, in roster order, with nearby ambiguity', () => {
    const rank = previewSelection(positions, scope, { kind: 'rank', anchorId: 'a', tolerance: .25 });
    expect(rank.ids).toEqual(['a', 'b']); expect(rank.candidates.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(rank.candidates.find(p => p.id === 'c')?.boundary).toBe(true);
    expect(previewSelection(positions, scope, { kind: 'file', anchorId: 'a', tolerance: .2 }).ids).toEqual(['a', 'd']);
    expect(previewSelection(positions, scope, { kind: 'rank', anchorId: 'a', tolerance: 0 }).ids).toEqual(['a']);
    expect(() => previewSelection(positions, ['b'], { kind: 'rank', anchorId: 'a', tolerance: .25 })).toThrow(/anchor/);
  });
  it('uses an explicitly closed polygon, boundary tolerance and stable IDs for overlapping and concave shapes', () => {
    const lasso = previewSelection(positions, scope, { kind: 'lasso', points: polygon, tolerance: .25 });
    expect(lasso.ids).toEqual(['a', 'b']); expect(lasso.candidates.find(p => p.id === 'b')?.boundary).toBe(true);
    const concave = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 25, y: 40 }, { x: 25, y: 15 }, { x: 0, y: 15 }];
    expect(previewSelection(positions, scope, { kind: 'lasso', points: concave, tolerance: 0 }).ids).toEqual(['a', 'b', 'c', 'e']);
    expect(previewSelection(positions, scope, { kind: 'lasso', points: [...polygon].reverse(), tolerance: .25 })).toEqual(lasso);
  });
  it('rejects invalid, unbounded and degenerate geometry and parses keyboard polygons', () => {
    expect(parseLassoPoints('5, 5; 20 5\n20,15\n5,15')).toEqual(polygon);
    expect(() => parseLassoPoints('5, 5\nNaN,2')).toThrow();
    for (const tolerance of [-1, 6, Infinity, NaN]) expect(() => previewSelection(positions, scope, { kind: 'lasso', points: polygon, tolerance })).toThrow(/tolerance/);
    for (const points of [[], [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], Array(513).fill(polygon[0]), [...polygon, { x: Infinity, y: 0 }]]) expect(() => previewSelection(positions, scope, { kind: 'lasso', points, tolerance: .25 })).toThrow();
  });
  it('adds sections, inverts filtered Cast and never changes the project, file state or history', () => {
    const store = createEditorStore(fixture()), before = store.getState();
    const sections = before.project.present.sections;
    store.dispatch('selection.section', { id: sections[0].id });
    store.dispatch('selection.section', { id: sections[1].id, additive: true });
    expect(store.getState().selection.selectedIds).toEqual(scope);
    store.setValue('ui', 'sectionFilter', sections[1].id); store.dispatch('selection.invert');
    expect(store.getState().selection.selectedIds).toEqual(['a', 'b', 'c']);
    expect(store.getState().project).toBe(before.project); expect(store.getState().fileSession).toBe(before.fileSession);
  });
  it('reviews ambiguous members and cancels or applies selection without undo or a geometry edit', () => {
    const store = createEditorStore(fixture()), before = store.getState().project;
    store.setValue('selection', 'selectedIds', ['e']);
    store.dispatch('selection.preview', { spec: { kind: 'rank', anchorId: 'a', tolerance: .25 }, additive: true });
    expect(store.getState().selection.selectedIds).toEqual(['e']);
    expect(store.dispatch('selection.review', { ids: ['a', 'c'], additive: true })).toBe(true);
    expect(store.dispatch('selection.review', { ids: ['missing'], additive: false })).toBe(false);
    store.dispatch('selection.cancel'); expect(store.getState().selection.selectedIds).toEqual(['e']);
    store.dispatch('selection.preview', { spec: { kind: 'lasso', points: polygon, tolerance: .25 }, additive: true });
    store.dispatch('selection.apply'); expect(store.getState().selection.selectedIds).toEqual(['e', 'a', 'b']);
    expect(store.getState().project).toBe(before);
  });
  it.each(['selection', 'set', 'filter', 'playback', 'revision', 'view'])('rejects a stale preview after a %s change', kind => {
    const store = createEditorStore(fixture());
    store.dispatch('selection.preview', { spec: { kind: 'rank', anchorId: 'a', tolerance: .25 } });
    if (kind === 'selection') store.setValue('selection', 'selectedIds', ['e']);
    if (kind === 'set') store.dispatch('set.select', { index: 1 });
    if (kind === 'filter') store.setValue('ui', 'castQuery', 'B');
    if (kind === 'playback') store.dispatch('playback.scrub', { count: 1 });
    if (kind === 'revision') store.dispatch('project.update', { title: 'Changed' });
    if (kind === 'view') store.setValue('ui', 'view', '3d');
    expect(store.getState().ui.selectionPreview).toBeNull(); expect(store.dispatch('selection.apply')).toBe(false);
  });
  it('section changes cancel contextual position previews without discarding unrelated draft state', () => {
    const store = createEditorStore(fixture()); store.setValue('selection', 'selectedIds', ['a']);
    store.dispatch('formation.preview', {}); expect(store.getState().ui.formationPreview).not.toBeNull();
    store.dispatch('selection.section', { id: store.getState().project.present.sections[1].id });
    expect(store.getState().ui.formationPreview).toBeNull(); expect(store.getState().selection.selectedIds).toEqual(['d', 'e']);
    store.setValue('ui', 'pendingDraft', true); store.dispatch('selection.section', { id: store.getState().project.present.sections[0].id });
    expect(store.getState().ui.pendingDraft).toBe(true); expect(store.getState().selection.selectedIds).toEqual(['a', 'b', 'c']);
  });
  it('guards unrelated drafts, gestures and geometry previews', () => {
    const store = createEditorStore(fixture()); store.setValue('selection', 'selectedIds', ['a']);
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('selection.section', { id: store.getState().project.present.sections[0].id })).toBe(true);
    expect(store.getState().ui.pendingDraft).toBe(true);
    expect(store.dispatch('group.create', { name: 'Lead' })).toBe(false);
    expect(store.dispatch('selection.preview', { spec: { kind: 'rank', anchorId: 'a', tolerance: .25 } })).toBe(false);
    store.setValue('ui', 'pendingDraft', false); store.beginTransaction('Gesture'); expect(store.dispatch('selection.invert')).toBe(false); store.cancelTransaction();
    store.dispatch('formation.preview', {}); expect(store.dispatch('selection.invert')).toBe(false); store.dispatch('formation.cancel');
    store.dispatch('selection.preview', { spec: { kind: 'rank', anchorId: 'a', tolerance: .25 } });
    expect(store.dispatch('selection.nudge', { key: 'ArrowRight' })).toBe(false); expect(store.dispatch('group.create', { name: 'Lead' })).toBe(false);
  });
  it('persists overlapping ID groups, prunes removal in the same undo and retains empty groups', () => {
    const store = createEditorStore(fixture()), geometry = store.getState().project.present.sets;
    store.setValue('selection', 'selectedIds', ['a', 'b']); store.dispatch('group.create', { name: 'Lead pair' });
    const id = store.getState().project.present.selectionGroups![0].id;
    store.setValue('selection', 'selectedIds', ['a']); store.dispatch('group.create', { name: 'Solo' });
    expect(store.getState().project.present.sets).toBe(geometry);
    const reopened = parseProject(serializeProject(store.getState().project.present)); expect(reopened.selectionGroups).toEqual(store.getState().project.present.selectionGroups);
    const fresh = createEditorStore(reopened); fresh.dispatch('group.select', { id }); expect(fresh.getState().selection.selectedIds).toEqual(['a', 'b']);
    fresh.dispatch('performers.remove', { ids: ['a', 'b'] });
    expect(fresh.getState().project.present.selectionGroups!.map(g => g.performerIds)).toEqual([[], []]);
    expect(fresh.getState().project.past).toHaveLength(1); expect(fresh.dispatch('group.select', { id })).toBe(false);
    fresh.dispatch('history.undo'); expect(fresh.getState().project.present).toEqual(reopened);
    fresh.dispatch('history.redo'); expect(parseProject(serializeProject(fresh.getState().project.present)).selectionGroups!.map(g => g.performerIds)).toEqual([[], []]);
  });
  it('gives group rename/update/delete one named undo each and preserves section membership', () => {
    const store = createEditorStore(fixture()); store.setValue('selection', 'selectedIds', ['a']); store.dispatch('group.create', { name: 'Solo' });
    const id = store.getState().project.present.selectionGroups![0].id, original = store.getState().project.present;
    store.dispatch('group.rename', { id, name: 'Lead' }); store.setValue('selection', 'selectedIds', ['b', 'c']); store.dispatch('group.update', { id }); store.dispatch('group.remove', { id });
    expect(store.getState().project.past.slice(-3).map(e => e.name)).toEqual(['Rename selection group · Lead', 'Replace group members · Lead', 'Delete selection group · Lead']);
    store.dispatch('history.undo'); store.dispatch('history.undo'); store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(original);
    expect(store.getState().project.present.performers).toEqual(fixture().performers);
  });
  it('rejects malformed or stale group metadata while old v1/v2 projects remain compatible', () => {
    const project = fixture(), group = { id: 'lead', name: 'Lead', performerIds: ['a'] };
    expect(parseProject(serializeProject(project))).not.toHaveProperty('selectionGroups');
    for (const selectionGroups of [null, [group, group], [{ ...group, performerIds: ['missing'] }], [{ ...group, performerIds: ['a', 'a'] }], [{ ...group, name: ' ' }], [{ ...group, name: 'x\n' }], [group, { ...group, id: 'other', name: ' lead ' }], Array(PROJECT_LIMITS.selectionGroups + 1).fill(group)]) expect(() => parseProject(JSON.stringify({ ...project, selectionGroups }))).toThrow(/selectionGroups/);
    const grouped = { ...project, selectionGroups: [group] }; expect(projectV2AsLegacy(grouped)).not.toHaveProperty('selectionGroups');
    expect(parseProject(JSON.stringify(projectV2AsLegacy(grouped))).sets).toEqual(project.sets);
  });
});
