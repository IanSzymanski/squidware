import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { captureParametricFormation } from '../templates/formations';
import { createEditorStore } from './store';
import { beginTemplateReview, templateReviewError, templateReviewResult } from './templateReview';

function fixture() {
  const store = createEditorStore(createDemoProject());
  const ids = store.getState().project.present.performers.slice(0, 8).map(p => p.id);
  store.setValue('selection', 'selectedIds', [...ids].reverse());
  expect(store.dispatch('templates.open')).toBe(true);
  const template = captureParametricFormation('Saved line', 'line', { center: { x: 50, y: 25 }, rotation: 0, width: 20, height: 0, columns: 4 }, 64);
  const review = beginTemplateReview(store.getState(), template);
  review.placement.center = { x: 50, y: 25 };
  return { store, ids, review };
}
describe('guarded template application', () => {
  it('explains an empty selection and rejects a no-op preview without creating history', () => {
    const { store, review } = fixture();
    store.setValue('selection', 'selectedIds', []);
    expect(templateReviewError(store.getState(), beginTemplateReview(store.getState(), review.template))).toMatch(/Select performers on the field/);
    store.setValue('selection', 'selectedIds', review.ids.slice(0, 1));
    const unchanged = beginTemplateReview(store.getState(), review.template), before = store.getState().project;
    expect(templateReviewResult(store.getState(), unchanged).changed).toBe(false);
    expect(store.dispatch('templates.apply', unchanged)).toBe(false);
    expect(store.getState().ui.toast).toMatch(/matches the current positions/);
    expect(store.getState().project).toBe(before);
  });
  it('keeps performer assignments fixed while moving and rotating an accepted preview', () => {
    const { store, review } = fixture();
    const before = templateReviewResult(store.getState(), review);
    review.placement.rotation = 180;
    const rotated = templateReviewResult(store.getState(), review);
    expect(rotated.error).toBeNull();
    for (const id of review.ids) {
      expect(rotated.updates[id].x).toBeCloseTo(100 - before.updates[id].x, 8);
      expect(rotated.updates[id].y).toBeCloseTo(50 - before.updates[id].y, 8);
    }
  });
  it('uses Cast order, previews without history, commits once, and reloads and undoes exactly', () => {
    const { store, ids, review } = fixture(), original = store.getState().project;
    expect(review.ids).toEqual(ids);
    const result = templateReviewResult(store.getState(), review);
    expect(result.error).toBeNull(); expect(store.getState().project).toBe(original);
    expect(store.dispatch('templates.apply', review)).toBe(true);
    const after = store.getState().project;
    expect(after.past).toHaveLength(1); expect(after.past[0].name).toContain('Apply saved formation · Saved line · 8 performers');
    expect(after.present.performers).toEqual(original.present.performers);
    expect(after.present.sets.slice(1)).toEqual(original.present.sets.slice(1));
    const other = original.present.performers[8].id;
    expect(after.present.sets[0].positions[other]).toEqual(original.present.sets[0].positions[other]);
    expect(parseProject(serializeProject(after.present))).toEqual(after.present);
    expect(store.dispatch('templates.apply', review)).toBe(false);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(original.present);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(after.present);
  });
  it('Cancel discards the review and never touches production history or save state', () => {
    const { store } = fixture(), before = store.getState();
    expect(store.dispatch('dialog.open', { dialog: null })).toBe(true);
    expect(store.getState().project).toBe(before.project);
    expect(store.getState().fileSession).toBe(before.fileSession);
  });
  it.each(['revision', 'epoch', 'set', 'selection', 'playback', 'rehearsal', 'draft', 'operation', 'dialog', 'transaction', 'between'] as const)('rejects changed %s context without applying any dots', change => {
    const { store, review } = fixture();
    switch (change) {
      case 'revision': store.dispatch('project.update', { title: 'Changed' }); break;
      case 'epoch': store.setValue('ui', 'projectEpoch', n => n + 1); break;
      case 'set': store.dispatch('set.select', { index: 1 }); break;
      case 'selection': store.setValue('selection', 'selectedIds', review.ids.slice(1)); break;
      case 'playback': store.setValue('playback', 'playing', true); break;
      case 'rehearsal': store.setValue('playback', 'rehearsalId', 'focused'); break;
      case 'draft': store.setValue('ui', 'pendingDraft', true); break;
      case 'operation': store.setValue('fileSession', 'fileOperation', 'opening'); break;
      case 'dialog': store.dispatch('dialog.open', { dialog: 'settings' }); break;
      case 'transaction': store.beginTransaction('Other edit'); break;
      case 'between': store.setValue('playback', 'count', 1); break;
    }
    const before = store.getState().project;
    expect(store.dispatch('templates.apply', review)).toBe(false); expect(store.getState().project).toBe(before);
  });
  it('rejects field overflow, malformed geometry and no-op previews atomically', () => {
    const { store, review } = fixture(), before = store.getState().project;
    review.placement.center.x = 0;
    expect(store.dispatch('templates.apply', review)).toBe(false); expect(store.getState().ui.toast).toMatch(/boundary/);
    expect(store.getState().project).toBe(before);
    const malformed = { ...review, template: { ...review.template, sourceCount: 999 } };
    expect(store.dispatch('templates.apply', malformed)).toBe(false); expect(store.getState().project).toBe(before);
    expect(templateReviewError(store.getState(), { ...review, ids: [] })).toMatch(/selection changed/i);
  });
  it('keeps aligned timing and recording anchors intact when changing a picture', () => {
    const { store, review } = fixture();
    store.dispatch('dialog.open', { dialog: null });
    const p = store.getState().project.present;
    expect(store.dispatch('project.load', { project: { ...p, audioAnchors: [{ count: 8, seconds: 5 }], audioOffsetSeconds: 1 } })).toBe(true);
    store.setValue('selection', 'selectedIds', review.ids); store.dispatch('templates.open');
    const next = beginTemplateReview(store.getState(), review.template); next.placement = review.placement;
    const before = store.getState().project.present;
    expect(before.audioAnchors).toHaveLength(1);
    expect(store.dispatch('templates.apply', next)).toBe(true);
    expect(store.getState().project.present.audioAnchors).toEqual(before.audioAnchors);
    expect(store.getState().project.present.moves).toEqual(before.moves);
    expect(parseProject(serializeProject(store.getState().project.present)).audioAnchors).toEqual(before.audioAnchors);
  });
});
