import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix4, Scene, Vector3, type InstancedMesh } from 'three';
import { compileChoreography, neutralCuePose, sampleChoreography, validateChoreography } from './choreography';
import { AssetBatches, AssetResources } from './components/3d/assetBatches';
import { sampleCueLegPose } from './components/legMotion';
import { countToSeconds, parseProject, sampleProject, sampleTimeline, secondsToCount, serializeProject } from './domain';
import { createEditorStore } from './editor/store';
import { createLegMotionFixture } from './examples/legMotionFixture';
import type { ChoreographyCue, Project } from './types';

const fixture = () => parseProject(readFileSync(new URL('../format/examples/choreography-v15.squid', import.meta.url), 'utf8'));
const sample = (project: Project, count: number) => sampleChoreography(compileChoreography(project), sampleTimeline(project, count))!;
const revision = (store: ReturnType<typeof createEditorStore>) => ({
  epoch: store.getState().ui.projectEpoch, revision: store.getState().project.revision,
});

describe('count-timed choreography', () => {
  it('keeps both feet planted through flexion and combines the independent flag track', () => {
    const project = createLegMotionFixture(64, 'choreography');
    const id = project.performers[0].id;
    const poseAt = (count: number) => sample(project, count).lowerBody.get(id) ?? neutralCuePose;
    expect(poseAt(0)).toEqual(neutralCuePose);
    expect(poseAt(1)).toEqual({ spread: 1, turnout: 35, drop: 0 });
    expect(poseAt(4)).toEqual({ spread: 1, turnout: 35, drop: .13 });
    expect(poseAt(7)).toEqual(poseAt(1));
    expect(poseAt(8)).toEqual(neutralCuePose);
    const straight = sampleCueLegPose(poseAt(1)), bent = sampleCueLegPose(poseAt(4));
    expect(bent.map(leg => leg.ankle)).toEqual(straight.map(leg => leg.ankle));
    expect(bent.map(leg => leg.toeYaw)).toEqual(straight.map(leg => leg.toeYaw));
    expect(bent[0].hip[1]).toBeLessThan(straight[0].hip[1]);
    expect(bent[0].knee[0]).toBeLessThan(straight[0].knee[0]);
    expect(bent[1].knee[0]).toBeGreaterThan(straight[1].knee[0]);
    expect([0, 2.5, 4, 6.5, 7].map(count => sample(project, count).flags.get(id) ?? 0)).toEqual([0, .5, 1, .5, 0]);
  });

  it('samples the same absolute phase after playback, reverse scrub, looping and tempo conversion', () => {
    const project = fixture();
    const target = 5.25;
    const intended = sample(project, target);
    for (const speed of [.25, 1, 2]) {
      const duration = countToSeconds(project, 24);
      const progress = (countToSeconds(project, target) / speed * speed + duration * 2) % duration;
      expect(sample(project, secondsToCount(project, progress))).toEqual(intended);
    }
    expect(sample(project, 12).lowerBody.size).toBe(0);
    expect(sample(project, target)).toEqual(intended);
    expect(sampleProject(project, target)).toEqual(sampleProject({ ...project, choreography: undefined }, target));
  });

  it('rejects collisions within a track and accepts independent members or adjacent cues', () => {
    const project = fixture(), [stance, flag] = project.choreography!;
    const overlapping = { ...stance, id: 'another' };
    expect(() => validateChoreography([stance, flag, overlapping], project)).toThrow(/lower body cues overlap/);
    expect(validateChoreography([stance, flag, { ...overlapping, performerIds: ['a'] }], project)).toHaveLength(3);
    expect(validateChoreography([stance, flag, { ...overlapping, start: 12, end: 16 }], project)).toHaveLength(3);
    expect(() => validateChoreography([{ ...stance, transition: .1 }], project)).toThrow(/Each transition/);
    expect(() => validateChoreography([{ ...stance, turnout: 90 }], project)).toThrow(/Turnout/);
    expect(() => validateChoreography([{ ...stance, depth: 1 }], project)).toThrow(/Plié depth/);
    expect(() => validateChoreography([{ ...stance, performerIds: ['missing'] }], project)).toThrow(/existing performers/);
  });

  it('preserves named undo and reload, and atomically blocks structural edits that would lose authored cues', () => {
    const project = fixture();
    const store = createEditorStore({ ...project, choreography: undefined });
    const [stance, flag] = project.choreography!;
    const baseline = store.getState().project.present;
    expect(store.dispatch('choreography.open')).toBe(true);
    expect(store.dispatch('choreography.save', { cue: stance, ...revision(store) })).toBe(true);
    expect(store.getState().project.past.at(-1)?.name).toBe('Add choreography cue');
    expect(store.dispatch('choreography.save', { cue: { ...flag, performerIds: ['a', 'b'] }, ...revision(store) })).toBe(false);
    expect(store.dispatch('choreography.save', { cue: flag, ...revision(store) })).toBe(true);
    const authored = store.getState().project.present;
    expect(authored.sets).toBe(baseline.sets);
    expect(authored.moves).toBe(baseline.moves);
    expect(parseProject(serializeProject(authored))).toEqual(authored);
    expect(store.dispatch('choreography.remove', { id: flag.id, ...revision(store) })).toBe(true);
    expect(store.getState().project.present.choreography).toEqual([stance]);
    expect(store.dispatch('history.undo')).toBe(true);
    expect(store.getState().project.present.choreography).toEqual([stance, flag]);
    expect(store.dispatch('dialog.open', { dialog: null })).toBe(true);
    expect(store.dispatch('set.update', { index: 1, update: { counts: 8 } })).toBe(false);
    expect(store.dispatch('set.remove', { index: 1 })).toBe(false);
    expect(store.dispatch('set.reorder', { index: 1, direction: 1 })).toBe(false);
    expect(store.dispatch('performers.remove', { ids: ['b'] })).toBe(false);
    expect(store.getState().project.present).toEqual(authored);
    expect(store.dispatch('set.update', { index: 1, update: { counts: 14 } })).toBe(true);
    expect(store.getState().project.present.choreography).toEqual([stance, flag]);
  });

  it('keeps flag cues portable after a role is reassigned and shifts the whole cue when an earlier move grows', () => {
    const project = fixture();
    const nextMove = project.moves[1];
    const cue: ChoreographyCue = { ...project.choreography![1], moveId: nextMove.id, fromSetId: nextMove.fromSetId,
      toSetId: nextMove.toSetId, start: 0, end: 8, transition: 1 };
    const store = createEditorStore({ ...project, choreography: [cue] });
    expect(sample(store.getState().project.present, 18).flags.get('b')).toBe(1);
    expect(store.dispatch('set.update', { index: 1, update: { counts: 20 } })).toBe(true);
    expect(sample(store.getState().project.present, 18).flags.get('b')).toBeUndefined();
    expect(sample(store.getState().project.present, 22).flags.get('b')).toBe(1);
    expect(store.dispatch('performer.appearance', { id: 'b', equipment: 'none' })).toBe(true);
    expect(parseProject(serializeProject(store.getState().project.present)).choreography).toEqual([cue]);
  });

  it('rotates pole geometry around an unchanged grip through performer translation and yaw', () => {
    const scene = new Scene(), batches = new AssetBatches(scene, new AssetResources());
    const pivot = [.34, 1.04, .22] as const;
    const part = { shape: 'box' as const, size: [1, 1, 1] as const, at: pivot, color: '#ffffff' };
    const matrix = new Matrix4();
    const position = (pitch: number) => {
      batches.update([{ parts: [part], at: [10, -.13, 18], angle: Math.PI / 2, tilt: { pivot, pitch } }]);
      (scene.children[0] as InstancedMesh).getMatrixAt(0, matrix);
      return new Vector3().setFromMatrixPosition(matrix);
    };
    const carry = position(50 * Math.PI / 180), up = position(0);
    expect(carry.distanceTo(up)).toBeLessThan(1e-6);
    expect(carry.x).toBeCloseTo(10.22);
    expect(carry.y).toBeCloseTo(.91);
    expect(carry.z).toBeCloseTo(17.66);
  });
});
