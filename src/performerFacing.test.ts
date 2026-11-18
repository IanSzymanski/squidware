import { describe, expect, it } from 'vitest';
import wire from '../format/examples/basic-v2.squid?raw';
import { analyzeTransition, parseProject, sampleProject, serializeProject } from './domain';
import { marchingDirection } from './analysis/rules';
import { transitionInput } from './analysis/input';
import { createEditorStore } from './editor/store';
import { splitTransition } from './editor/splitTransition';
import { createPicture } from './editor/projectEdits';
import { directionFromFacing } from './performerFacing';

const fixture = () => parseProject(wire);

describe('authored performer facing', () => {
  it('samples the shortest turn at written counts while keeping travel and missing headings independent', () => {
    const project = fixture();
    const original = sampleProject(project, 8).positions;
    project.sets[0].facings = { a: 350, b: 90 };
    project.sets[1].facings = { a: 10 };
    expect(sampleProject(project, 0).facings).toEqual({ a: 350, b: 90 });
    expect(sampleProject(project, 8)).toMatchObject({ positions: original, facings: { a: 0 } });
    expect(sampleProject(project, 16).facings).toEqual({ a: 10 });
    expect(sampleProject(project, 20).facings).toBeUndefined();
    project.sets[0].facings = { a: 0 };
    project.sets[1].facings = { a: 180 };
    expect(sampleProject(project, 8).facings).toEqual({ a: 90 });
    project.sets[1].positions.a = project.sets[0].positions.a;
    expect(sampleProject(project, 8)).toMatchObject({ positions: { a: project.sets[0].positions.a }, facings: { a: 90 } });
  });

  it('preserves headings across set copies and splits without assigning a heading to a new blank set', () => {
    const project = fixture();
    project.sets[0].facings = { a: 350 };
    project.sets[1].facings = { a: 10, b: 30 };
    const split = splitTransition(project, { moveId: project.moves[0].id, count: 8 });
    expect(split.sets[1].facings).toEqual({ a: 0 });
    for (const count of [0, 4, 8, 12, 16]) expect(sampleProject(split, count).facings).toEqual(sampleProject(project, count).facings);
    const plain = fixture();
    plain.sets[1].facings = { a: 175 };
    expect(createPicture(plain, 1, 'duplicate', 8).sets[2].facings).toEqual({ a: 175 });
    expect(createPicture(plain, 1, 'hold', 8).sets[2].facings).toEqual({ a: 175 });
    expect(createPicture(plain, 1, 'new', 8).sets[2].facings).toBeUndefined();
  });

  it('applies direction rules only with a declaration or provable travel relative to facing', () => {
    const project = fixture(), move = project.moves[0];
    expect(marchingDirection(project, 0, 'a').direction).toBe('unknown');
    project.analysisRules = { defaults: { minimumSpacing: 1, maximumStride: 4 }, directions: { backward: { maximumStride: .5 } } };
    project.sets[0].facings = { a: 270, b: 90 };
    project.sets[1].facings = { a: 270, b: 80 };
    expect(marchingDirection(project, 0, 'a')).toEqual({ direction: 'backward', source: 'authored facing' });
    expect(transitionInput(project, 1, 1)?.tracks[0].maximumStride).toBe(.5);
    expect(analyzeTransition(project, 1).some(issue => issue.message.includes('backward from authored facing'))).toBe(true);
    expect(marchingDirection(project, 0, 'b').direction).toBe('unknown');
    move.marchingDirections = { a: 'forward' };
    expect(marchingDirection(project, 0, 'a')).toEqual({ direction: 'forward', source: 'declared' });
    expect(transitionInput(project, 1, 1)?.tracks[0].maximumStride).toBe(4);
    expect(directionFromFacing({ x: 0, y: 0 }, { x: 0, y: 2 }, undefined, 90, 90)).toBe('sideways');
    expect(directionFromFacing({ x: 0, y: 0 }, { x: 0, y: 0 }, undefined, 90, 90)).toBeUndefined();
    const curve = { segments: [{ id: 'curve', kind: 'cubic' as const, startCount: 0, endCount: 8,
      control1: { x: 4, y: 0 }, control2: { x: 3, y: 0 } }] };
    expect(directionFromFacing({ x: 0, y: 0 }, { x: 8, y: 0 }, curve, 90, 90)).toBeUndefined();
  });

  it('records named undo edits, rejects invalid values and removes metadata with a performer', () => {
    const store = createEditorStore(fixture()), project = store.getState().project.present;
    expect(store.dispatch('performer.facing', { index: 0, ids: ['a', 'b'], angle: 90 })).toBe(true);
    expect(store.getState().project.past.at(-1)?.name).toBe('Set performer facing');
    expect(store.dispatch('performer.appearance', { id: 'a', role: 'guard', costumeColor: '#345678' })).toBe(true);
    const edited = store.getState().project.present;
    expect(edited.sets[0].positions).toBe(project.sets[0].positions);
    expect(edited.moves).toBe(project.moves);
    expect(parseProject(serializeProject(edited))).toEqual(edited);
    expect(store.dispatch('performer.facing', { index: 0, ids: ['a'], angle: 360 })).toBe(false);
    expect(store.dispatch('performer.appearance', { id: 'a', costumeColor: 'blue' })).toBe(false);
    expect(store.getState().project.present).toBe(edited);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present.performers[0].appearance).toBeUndefined();
    expect(store.dispatch('history.redo')).toBe(true);
    expect(store.dispatch('performers.remove', { ids: ['a'] })).toBe(true);
    expect(store.getState().project.present.sets[0].facings).toEqual({ b: 90 });
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present).toEqual(edited);
  });
});
