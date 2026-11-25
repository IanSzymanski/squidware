import { describe, expect, it } from 'vitest';
import { createBlankProject, parseProject, sampleProject, serializeProject } from './domain';
import { createPicture, moveSetTo, reconnectSets, updateSetProperties } from './editor/projectEdits';
import { splitTransition } from './editor/splitTransition';
import { saveStagingObject } from './editor/stagingEdits';
import { createEditorStore } from './editor/store';
import { stagingPlacements } from './components/3d/stagingModels';
import { frontEnsembleModels } from './components/3d/assetModels';
import { frontEnsembleCatalog } from './frontEnsemble';
import type { StagingPose } from './staging';

const object = { id: 'platform', name: 'Platform' };
const opening: StagingPose = { x: 20, y: 40, width: 4, depth: 2, height: 1, angle: 350, visible: true };
const arrival: StagingPose = { ...opening, x: 40, y: 30, width: 6, angle: 10, visible: false, travel: { start: .25, end: .75 } };

function fixture() {
  const project = createBlankProject();
  const person = { id: 'p1', name: '', label: 'P1', sectionId: project.sections[0].id };
  project.performers.push(person);
  project.sets[0].positions[person.id] = { x: 20, y: 40 };
  const show = createPicture(project, 0, 'hold', 16);
  const placed = saveStagingObject(show, 0, { object, pose: opening, create: true });
  return saveStagingObject(placed, 1, { object, pose: arrival, create: false });
}

describe('set staging', () => {
  it('shares fixed-scale models between independent prop instances and keeps both footprints editable', () => {
    const project = fixture();
    const model = 'marimba' as const;
    const { width, depth, height } = frontEnsembleCatalog[model];
    const left = { id: 'marimba-left', name: 'Left marimba', model }, right = { id: 'marimba-right', name: 'Right marimba', model };
    const defaultPose = { ...opening, width, depth, height, angle: 0 };
    const pair = saveStagingObject(saveStagingObject(project, 0, { object: left, pose: defaultPose, create: true }), 0,
      { object: right, pose: { ...defaultPose, x: 50 }, create: true });
    const changed = saveStagingObject(pair, 1, { object: left, pose: { ...defaultPose, width: 8, angle: 90, visible: false }, create: false });
    const reopened = parseProject(serializeProject(changed));
    const halfway = sampleProject(reopened, 8).staging!.filter(item => item.model);
    const atArrival = sampleProject(reopened, 16).staging!.filter(item => item.model);
    expect(halfway).toMatchObject([{ id: left.id, angle: 45, width: (8 + width) / 2 }, { id: right.id, x: 50, angle: 0, width }]);
    const placements = stagingPlacements(halfway, 100, project.field.height);
    expect(placements).toMatchObject([{ at: [-30, 0, 40 - project.field.height / 2], angle: Math.PI / 4 },
      { at: [0, 0, 40 - project.field.height / 2], angle: 0 }]);
    expect(placements.every(placement => placement.parts === frontEnsembleModels.marimba && !placement.scale)).toBe(true);
    expect(stagingPlacements(atArrival, 100, project.field.height)).toEqual([placements[1]]);
  });

  it('samples stationary and timed travel, using the shortest turn and switching visibility on arrival', () => {
    const project = fixture();
    const sample = (count: number) => sampleProject(project, count).staging![0];
    expect(sample(3.5)).toMatchObject({ ...opening, ...object });
    expect(sample(8)).toMatchObject({ x: 30, y: 35, angle: 0, width: 5, visible: true });
    expect(sample(14)).toMatchObject({ x: 40, y: 30, angle: 10, width: 6, visible: true });
    expect(sample(16)).toMatchObject({ x: 40, y: 30, angle: 10, width: 6, visible: false });
    expect(stagingPlacements([sample(8)], project.field.width, project.field.height)[0])
      .toMatchObject({ at: [-20, 0, 35 - project.field.height / 2], angle: 0, scale: [5, 1, 2] });
    expect(stagingPlacements([sample(16)], project.field.width, project.field.height)).toEqual([]);

    const reappears = moveSetTo(project, project.sets[1].id, 0);
    const nextCount = reappears.moves[0].counts;
    expect(sampleProject(reappears, nextCount - .01).staging![0].visible).toBe(false);
    expect(sampleProject(reappears, nextCount).staging![0].visible).toBe(true);
    expect(sampleProject(updateSetProperties(project, 1, { counts: 32 }), 16).staging).toEqual([sample(8)]);
  });

  it('partitions travel when splitting before, within or after the travel window', () => {
    const project = fixture();
    for (const count of [2, 4, 7, 12, 14]) {
      const divided = splitTransition(project, { moveId: project.moves[0].id, count });
      const reopened = parseProject(serializeProject(divided));
      for (let at = 0; at <= 16; at += .5) {
        const expected = sampleProject(project, at).staging![0], actual = sampleProject(reopened, at).staging![0];
        for (const key of ['x', 'y', 'width', 'depth', 'height'] as const) expect(actual[key]).toBeCloseTo(expected[key], 8);
        expect(Math.min(Math.abs(actual.angle - expected.angle), 360 - Math.abs(actual.angle - expected.angle))).toBeLessThan(1e-8);
        expect(actual.visible).toBe(expected.visible);
      }
    }
  });

  it('keeps independent pose maps through new, copied, inserted and deleted sets', () => {
    const project = fixture();
    for (const kind of ['new', 'duplicate', 'insert-before', 'hold'] as const) {
      const result = createPicture(project, 1, kind, 16);
      const added = result.sets.find(set => !project.sets.some(previous => previous.id === set.id))!;
      expect(added.staging?.platform).toMatchObject(kind === 'insert-before' ? opening : { x: 40, angle: 10, visible: false });
      expect(added.staging?.platform.travel).toBeUndefined();
      expect(parseProject(serializeProject(result)).stagingObjects).toEqual([object]);
      expect(reconnectSets(result, result.sets.filter(set => set.id !== added.id)).stagingObjects).toEqual([object]);
    }
  });

  it('keeps performer selection independent and makes apply and remove atomic, named undo actions', () => {
    const store = createEditorStore(fixture());
    store.setValue('selection', 'selectedIds', ['p1']);
    expect(store.dispatch('staging.open')).toBe(true);
    const context = () => {
      const { project, ui, selection } = store.getState();
      return { revision: project.revision, epoch: ui.projectEpoch, setId: project.present.sets[selection.activeIndex].id };
    };
    const original = store.getState().project.present;
    expect(store.dispatch('staging.save', { ...context(), object, pose: { ...opening, x: 200 }, create: false })).toBe(false);
    expect(store.getState().project.present).toBe(original);
    expect(store.dispatch('staging.save', { ...context(), object, pose: { ...opening, angle: 90 }, create: false })).toBe(true);
    expect(store.getState().project.past.at(-1)?.name).toMatch(/^Edit prop · Platform/);
    expect(store.dispatch('staging.remove', { ...context(), id: object.id })).toBe(true);
    expect(store.getState().project.present.sets[0].staging).toBeUndefined();
    expect(store.getState().project.past.at(-1)?.name).toBe('Remove prop · Platform');
    store.dispatch('history.undo');
    expect(store.getState().project.present.sets[0].staging?.platform.angle).toBe(90);
    store.dispatch('history.undo');
    expect(store.getState().project.present).toEqual(original);
    store.dispatch('history.redo');
    expect(store.getState().project.present.sets[0].staging?.platform.angle).toBe(90);
    expect(store.getState().selection.selectedIds).toEqual(['p1']);
  });
});
