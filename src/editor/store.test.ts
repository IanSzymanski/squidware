import { setTiming } from '../domain';
import { describe, expect, it, vi } from 'vitest';
import { createBlankProject, createDemoProject, exportCoordinatesCsv, parseProject, PROJECT_LIMITS, serializeProject, setStartCount } from '../domain';
import { commandMetadata, commandRegistry } from './commands';
import { AUTOSAVE_KEY, createEditorStore, recoverProject } from './store';
import { menuCommands } from './useCommandController';
import { createDraftTracker } from './drafts';
import { canEditPositions, isAtActiveSet } from './editMode';

describe('editor store and command registry', () => {
  it('tracks pending drafts separately and clears them after unmount or project replacement', () => {
    const tracker = createDraftTracker();
    expect(tracker.update(true, 'counts')).toBe(true); expect(tracker.update(true, 'tempo')).toBe(true);
    expect(tracker.update(false, 'tempo')).toBe(true); expect(tracker.update(false, 'counts')).toBe(false);
    tracker.update(true, 'counts'); tracker.clear(); expect(tracker.update(false, 'another')).toBe(false);
  });
  it('provides stable typed command metadata for menus, help and other clients', () => {
    expect(new Set(commandMetadata.map(c => c.id)).size).toBe(commandMetadata.length);
    commandMetadata.forEach(command => {
      expect(command.name.length).toBeGreaterThan(0); expect(command.description.length).toBeGreaterThan(0);
      expect(typeof command.arguments).toBe('object');
      expect(typeof commandRegistry[command.id].enabled).toBe('function');
      expect(typeof commandRegistry[command.id].execute).toBe('function');
    });
    Object.values(menuCommands).forEach(id => expect(commandRegistry[id]).toBeDefined());
  });

  it('notifies project and UI selectors only for their relevant changes', () => {
    const store = createEditorStore(createDemoProject());
    const original = store.getState().project;
    const projectListener = vi.fn(); const selectionListener = vi.fn(); const frameListener = vi.fn(); const playingListener = vi.fn();
    store.subscribeSelector(s => s.project, projectListener);
    store.subscribeSelector(s => s.selection, selectionListener);
    const unsubscribeFrames = store.subscribeSelector(s => s.playback.count, frameListener);
    store.subscribeSelector(s => s.playback.playing, playingListener);
    for (let frame = 1; frame <= 60; frame++) store.setValue('playback', 'count', frame / 60);
    expect(frameListener).toHaveBeenCalledTimes(60);
    expect(projectListener).not.toHaveBeenCalled(); expect(selectionListener).not.toHaveBeenCalled(); expect(playingListener).not.toHaveBeenCalled();
    expect(store.getState().project).toBe(original);
    store.dispatch('selection.all'); expect(selectionListener).toHaveBeenCalledTimes(1);
    store.setValue('ui', 'view', '3d'); expect(projectListener).not.toHaveBeenCalled();
    unsubscribeFrames(); store.setValue('playback', 'count', 2); expect(frameListener).toHaveBeenCalledTimes(60);
    store.dispatch('project.update', { title: 'Edited show' }); expect(projectListener).toHaveBeenCalledTimes(1);
    expect(store.getState().project.past).toHaveLength(1);
  });

  it('keeps the shell arrival selector stable through frames between set arrivals', () => {
    const store = createEditorStore(createDemoProject()); const listener = vi.fn();
    store.subscribeSelector(s => Math.abs(s.playback.count - setStartCount(s.project.present, s.selection.activeIndex)) < 0.001, listener);
    for (let frame = 1; frame <= 60; frame++) store.setValue('playback', 'count', frame / 60);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid navigation arguments and clamps integer boundary navigation', () => {
    const store = createEditorStore(createDemoProject());
    for (const index of [0.5, NaN, Infinity]) expect(store.dispatch('set.select', { index })).toBe(false);
    expect(store.getState().selection.activeIndex).toBe(0);
    store.dispatch('set.select', { index: 999 }); expect(store.getState().selection.activeIndex).toBe(5);
    store.dispatch('set.select', { index: -1 }); expect(store.getState().selection.activeIndex).toBe(0);
  });

  it('dispatches one coherent notification for compound edits and supports reversible undo/redo', () => {
    const store = createEditorStore(createDemoProject()); const listener = vi.fn(); const before = store.getState().project.present;
    store.subscribe(listener);
    expect(store.dispatch('set.add', { index: 0 })).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const added = store.getState(); expect(added.project.present.sets).toHaveLength(before.sets.length + 1);
    expect(added.selection.activeIndex).toBe(1); expect(added.playback.count).toBe(32);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(before);
    expect(store.getState().playback.playing).toBe(false);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(added.project.present);
    store.dispatch('history.undo'); store.dispatch('project.update', { title: 'New branch' }); expect(store.getState().project.future).toHaveLength(0);
    const history = store.getState().project;
    store.dispatch('project.update', { title: 'New branch' }); expect(store.getState().project).toBe(history);
  });

  it('enforces canonical editor limits without clamping or recording invalid edits', () => {
    const store = createEditorStore(createDemoProject()); const before = store.getState().project;
    expect(store.dispatch('set.update', { index: 0, update: { counts: 1 } })).toBe(false);
    expect(store.dispatch('set.update', { index: 1, update: { counts: PROJECT_LIMITS.counts.max + 1 } })).toBe(false);
    expect(store.dispatch('set.update', { index: 1, update: { counts: 2.5 } })).toBe(false);
    expect(store.getState().project).toBe(before); expect(store.getState().ui.toast).toContain('counts');
    expect(store.dispatch('set.update', { index: 1, update: { counts: PROJECT_LIMITS.counts.max, tempo: PROJECT_LIMITS.tempo.max } })).toBe(true);
    const next = store.getState().project.present;
    expect(parseProject(serializeProject(next))).toEqual(next);
    while (store.getState().project.present.sections.length < PROJECT_LIMITS.sections) expect(store.dispatch('section.add')).toBe(true);
    const full = store.getState().project; expect(store.dispatch('section.add')).toBe(false); expect(store.getState().project).toBe(full);
  });

  it('protects coordinates during playback and scrubbing and transforms only selected performers', () => {
    const store = createEditorStore(createDemoProject()); const project = store.getState().project.present;
    const id = project.performers[0].id; const otherId = project.performers[1].id;
    store.dispatch('set.select', { index: 1 });
    const from = store.getState().project.present.sets[1].positions;
    expect(store.dispatch('selection.transform', { index: 1, ids: [id], options: { dx: 0.625 } })).toBe(true);
    expect(store.getState().project.present.sets[1].positions[id].x).toBeCloseTo(from[id].x + 0.625);
    expect(store.getState().project.present.sets[1].positions[otherId]).toEqual(from[otherId]);
    store.dispatch('playback.toggle'); const playing = store.getState().project;
    expect(store.dispatch('positions.move', { index: 1, updates: { [id]: { x: 20, y: 20 } } })).toBe(false);
    expect(store.getState().project).toBe(playing);
    store.dispatch('playback.scrub', { count: 10 });
    expect(store.getState().playback.playing).toBe(false);
    expect(store.dispatch('positions.move', { index: store.getState().selection.activeIndex, updates: { [id]: { x: 20, y: 20 } } })).toBe(false);
    store.dispatch('set.select', { index: 1 });
    expect(store.dispatch('formation.apply', { index: 1, ids: [id], kind: 'line', options: { center: { x: 50, y: 25 }, width: 30, height: 10, rotation: 0, columns: 8 } })).toBe(true);
    expect(store.getState().project.present.sets[1].positions[otherId]).toEqual(from[otherId]);
  });

  it('locks every positional command between arrivals and recovers without editing history', () => {
    const project = createDemoProject();
    const store = createEditorStore(project);
    const id = project.performers[0].id;
    const arrival = setStartCount(project, 1);
    for (const count of [0.01, arrival / 2, arrival - 0.01, arrival + 0.01]) {
      store.dispatch('playback.scrub', { count });
      const before = store.getState().project;
      const index = store.getState().selection.activeIndex;
      expect(canEditPositions(store.getState())).toBe(false);
      expect(store.dispatch('positions.move', { index, updates: { [id]: { x: 20, y: 20 } } })).toBe(false);
      expect(store.dispatch('selection.transform', { index, ids: [id], options: { dx: 0.625 } })).toBe(false);
      expect(store.dispatch('formation.apply', { index, ids: [id], kind: 'line', options: { center: { x: 50, y: 25 }, width: 30, height: 10, rotation: 0, columns: 8 } })).toBe(false);
      expect(store.getState().project).toBe(before);
      store.dispatch('set.select', { index });
      expect(store.getState().playback.count).toBe(setStartCount(project, index));
      expect(canEditPositions(store.getState())).toBe(true);
      expect(store.getState().project).toBe(before);
    }
    for (const count of [0, arrival, setStartCount(project, project.sets.length - 1)]) {
      store.dispatch('playback.scrub', { count });
      expect(isAtActiveSet(store.getState())).toBe(true);
      expect(canEditPositions(store.getState())).toBe(true);
    }
    store.dispatch('set.select', { index: 1 });
    store.dispatch('playback.toggle');
    expect(isAtActiveSet(store.getState())).toBe(true);
    expect(canEditPositions(store.getState())).toBe(false);
    store.dispatch('set.select', { index: 1 });
    expect(store.getState().playback.playing).toBe(false);
    expect(canEditPositions(store.getState())).toBe(true);
    const single = createEditorStore(createBlankProject());
    single.dispatch('playback.scrub', { count: 100 });
    expect(single.getState().playback.count).toBe(0);
    expect(canEditPositions(single.getState())).toBe(true);
  });

  it('routes roster edits, all-set positions and set ordering through commands', () => {
    const store = createEditorStore(createBlankProject());
    const sectionId = store.getState().project.present.sections[0].id;
    const person = { id: 'new-performer', label: 'P1', name: '', sectionId };
    store.dispatch('performers.add', { performers: [person] });
    store.dispatch('performer.update', { id: person.id, update: { name: 'Alice' } });
    store.dispatch('set.add', { index: 0 }); store.dispatch('set.update', { index: 1, update: { name: 'Second' } });
    store.dispatch('set.reorder', { index: 1, direction: -1 });
    expect(store.getState().project.present.sets[0].name).toBe('Second');
    expect(setTiming(store.getState().project.present, 0).counts).toBe(0); expect(store.getState().project.present.moves[0].counts).toBe(32);
    expect(store.getState().project.present.performers[0].name).toBe('Alice');
    store.dispatch('performers.remove', { ids: [person.id] });
    expect(store.getState().project.present.sets.every(set => !(person.id in set.positions))).toBe(true);
    store.dispatch('history.undo'); expect(store.getState().project.present.performers).toHaveLength(1);
    store.dispatch('set.remove', { index: 0 }); expect(setTiming(store.getState().project.present, 0).counts).toBe(0);
    expect(store.dispatch('set.remove', { index: 0 })).toBe(false);
  });

  it('initializes the add-cast draft within the remaining roster capacity', () => {
    const store = createEditorStore(createBlankProject()); const sectionId = store.getState().project.present.sections[0].id;
    const performers = Array.from({ length: PROJECT_LIMITS.performers - 1 }, (_, i) => ({ id: `p${i}`, label: `P${i}`, name: '', sectionId }));
    store.dispatch('performers.add', { performers }); store.dispatch('dialog.open', { dialog: 'add-cast' });
    expect(store.getState().ui.castAmount).toBe(1);
    store.dispatch('performers.add', { performers: [{ id: 'last', label: 'Last', name: '', sectionId }] });
    store.dispatch('dialog.open', { dialog: 'add-cast' }); expect(store.getState().ui.castAmount).toBe(1);
    expect(store.dispatch('performers.add', { performers: [{ id: 'over-limit', label: 'Extra', name: '', sectionId }] })).toBe(false);
  });

  it('creates, saves, reopens and exports a v2 production through reusable commands', async () => {
    const store = createEditorStore(createDemoProject()); let saved = '';
    store.registerExternal('file.save', () => { saved = serializeProject(store.getState().project.present); });
    store.registerExternal('file.open', () => { store.dispatch('project.load', { project: parseProject(saved) }); });
    store.dispatch('project.update', { title: 'Saved show', preset: 'high-school', audioOffsetSeconds: -1 });
    await store.dispatch('file.save');
    store.dispatch('project.update', { title: 'Later edit' }); store.dispatch('set.select', { index: 4 });
    await store.dispatch('file.open');
    const state = store.getState(); expect(state.project.present.title).toBe('Saved show'); expect(state.project.present.schemaVersion).toBe(2);
    expect(state.project.past).toHaveLength(0); expect(state.selection.activeIndex).toBe(0); expect(state.playback.count).toBe(0);
    expect(state.ui.projectEpoch).toBe(1); expect(exportCoordinatesCsv(state.project.present).includes(state.project.present.sets[0].name)).toBe(true);
    store.dispatch('file.export'); expect(store.getState().ui.dialog).toBe('export');
    store.dispatch('file.new'); expect(store.getState().ui.dialog).toBe('new');
    store.dispatch('project.load', { project: createBlankProject() }); expect(store.getState().project.present.performers).toHaveLength(0);
  });

  it('reports both synchronous and asynchronous controller failures consistently', async () => {
    const store = createEditorStore(createDemoProject());
    expect(store.dispatch('file.save')).toBe(false); expect(store.getState().ui.toast).toContain('not available');
    const unregister = store.registerExternal('file.save', async () => { throw new Error('disk failure'); });
    expect(await store.dispatch('file.save')).toBe(false); expect(store.getState().ui.toast).toBe('disk failure');
    unregister(); expect(store.dispatch('file.save')).toBe(false);
  });

  it('lets a file controller save the latest synchronous draft commit inside dispatch', async () => {
    const store = createEditorStore(createDemoProject()); let saved = '';
    const listener = vi.fn(); store.subscribe(listener);
    store.registerExternal('file.save', () => {
      // Blurring an input can synchronously dispatch an edit while the save command is running.
      store.dispatch('project.update', { title: 'Committed during save' });
      saved = serializeProject(store.getState().project.present);
    });
    await store.dispatch('file.save');
    expect(parseProject(saved).title).toBe('Committed during save'); expect(listener).toHaveBeenCalledTimes(1);
  });

  it('recovers a saved project and preserves errors including denied storage acquisition', () => {
    const project = createDemoProject();
    const getItem = vi.fn(() => serializeProject(project));
    expect(recoverProject({ getItem }).project).toEqual(project); expect(getItem).toHaveBeenCalledWith(AUTOSAVE_KEY);
    const denied = recoverProject(() => { throw new Error('Storage denied'); });
    expect(denied.project.schemaVersion).toBe(2); expect(denied.recoveryError).toBe('Storage denied');
    const corrupt = recoverProject({ getItem: () => '{broken' }); expect(corrupt.recoveryError).toBeDefined();
  });
});
