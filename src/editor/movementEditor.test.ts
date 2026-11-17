import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../domain';
import { createEditorStore } from './store';
import { canEditPositions } from './editMode';
import { isModalOpen } from './confirmation';

function editor() {
  const store = createEditorStore(createDemoProject());
  store.dispatch('set.select', { index: 1 });
  store.setValue('selection', 'selectedIds', [store.getState().project.present.performers[0].id]);
  store.dispatch('set.update', { index: 1, update: { notes: 'Retain this undo entry' } });
  store.dispatch('path.draw-open');
  return store;
}

describe('docked movement editing', () => {
  it('locks unrelated changes and history even before drawing has made a pending draft', () => {
    const store = editor(), before = store.getState().project;
    expect(isModalOpen(store.getState())).toBe(false);
    expect(canEditPositions(store.getState())).toBe(false);
    expect(store.dispatch('history.undo')).toBe(false);
    expect(store.dispatch('selection.clear')).toBe(false);
    expect(store.dispatch('set.update', { index: 1, update: { counts: 24 } })).toBe(false);
    expect(store.dispatch('performers.remove', { ids: store.getState().selection.selectedIds })).toBe(false);
    expect(store.dispatch('dialog.open', { dialog: 'settings' })).toBe(false);
    expect(store.dispatch('playback.scrub', { count: NaN })).toBe(false);
    expect(store.getState().ui.dialog).toBe('path-draw');
    expect(store.getState().project).toBe(before);
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('field.zoom-in')).toBe(true);
    expect(store.getState().ui.dialog).toBe('path-draw');
    expect(store.getState().project).toBe(before);
  });

  it('ends the draft on timeline scrubbing, set navigation and playback without committing it', () => {
    for (const action of ['scrub', 'set', 'play'] as const) {
      const store = editor(), before = store.getState().project;
      store.setValue('ui', 'pendingDraft', true);
      if (action === 'scrub') store.dispatch('playback.scrub', { count: 4 });
      else if (action === 'set') store.dispatch('set.select', { index: 0 });
      else store.dispatch('playback.toggle');
      expect(store.getState().ui.dialog).toBeNull();
      expect(store.getState().ui.pendingDraft).toBe(false);
      expect(store.getState().project).toBe(before);
    }
  });

  it('opens scheduled paths on the 2D design field from another view', () => {
    const store = editor();
    store.dispatch('dialog.open', { dialog: null });
    store.setValue('ui', 'view', '3d');
    store.setValue('ui', 'workspace', 'production');
    expect(store.dispatch('schedule.open')).toBe(true);
    expect(store.getState().ui).toMatchObject({ view: '2d', workspace: 'design', dialog: 'movement-schedule' });
  });
});

describe('docked shared routes', () => {
  function routes() {
    const store = editor();
    store.dispatch('dialog.open', { dialog: null });
    store.setValue('ui', 'view', '3d');
    expect(store.dispatch('routes.open')).toBe(true);
    return store;
  }
  it('locks positions, selection and history on an untouched route and preserves field controls', () => {
    const store = routes(), before = store.getState().project;
    expect(store.getState().ui).toMatchObject({ dialog: 'routes', workspace: 'design', view: '2d' });
    expect(isModalOpen(store.getState())).toBe(false);
    expect(canEditPositions(store.getState())).toBe(false);
    for (const id of ['history.undo', 'history.redo', 'selection.clear', 'schedule.open', 'routes.open'] as const) expect(store.dispatch(id)).toBe(false);
    expect(store.dispatch('set.update', { index: 1, update: { notes: 'blocked' } })).toBe(false);
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('field.zoom-in')).toBe(true);
    expect(store.dispatch('dialog.open', { dialog: 'settings' })).toBe(false);
    expect(store.getState().project).toBe(before);
  });
  it('discards route drafts on transport navigation', () => {
    for (const action of ['scrub', 'set', 'play'] as const) {
      const store = routes(), before = store.getState().project;
      store.setValue('ui', 'pendingDraft', true);
      if (action === 'scrub') expect(store.dispatch('playback.scrub', { count: 4 })).toBe(true);
      else if (action === 'set') expect(store.dispatch('set.select', { index: 0 })).toBe(true);
      else expect(store.dispatch('playback.toggle')).toBe(true);
      expect(store.getState().ui).toMatchObject({ dialog: null, pendingDraft: false });
      expect(store.getState().project).toBe(before);
    }
  });
  it('commits only a current route review as one named undo entry', async () => {
    const { newSharedRoute } = await import('./routeEditing');
    const store = routes(), state = store.getState();
    const route = newSharedRoute([], state.project.present.field);
    const request = { routeId: route.id, route, existing: false, revision: state.project.revision, epoch: state.ui.projectEpoch };
    expect(store.dispatch('routes.save', { ...request, revision: request.revision - 1 })).toBe(false);
    expect(store.dispatch('routes.save', { ...request, epoch: request.epoch + 1 })).toBe(false);
    expect(store.dispatch('schedule.save', { moveId: state.project.present.moves[0].id, performerId: state.selection.selectedIds[0], path: null, revision: request.revision, epoch: request.epoch })).toBe(false);
    store.setValue('ui', 'pendingDraft', true);
    expect(store.dispatch('routes.save', request)).toBe(false);
    store.setValue('ui', 'pendingDraft', false);
    expect(store.dispatch('routes.save', request)).toBe(true);
    expect(store.getState().project.present.sharedRoutes).toEqual([route]);
    expect(store.getState().project.present.sets).toEqual(state.project.present.sets);
    expect(store.getState().project.present.moves).toEqual(state.project.present.moves);
    expect(store.getState().project.past.at(-1)?.name).toBe(`Save shared route · ${route.name}`);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present).toEqual(state.project.present);
    expect(store.dispatch('history.redo')).toBe(true);
    expect(store.getState().project.present.sharedRoutes).toEqual([route]);
  });
});
