import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { countToSeconds, parseProject, sampleProject, secondsToCount, serializeProject } from '../domain';
import { createLegMotionFixture, legMotionFrame, type MotionScenario } from '../examples/legMotionFixture';
import { sampleLegPose } from './legMotion';
import { LegMotionMeshes } from './legMotionMeshes';

const origin = { x: 12, y: 15 };
const ahead = { ...origin, y: 16 };

describe('count-driven leg prototype', () => {
  it('holds still at identical positions and with unknown facing unless explicitly marking time', () => {
    const neutral = sampleLegPose(0, origin, origin, 0, false);
    expect(sampleLegPose(1.5, origin, origin, 90, false)).toEqual(neutral);
    expect(sampleLegPose(1.5, origin, ahead, undefined, false)).toEqual(neutral);
    const markTime = sampleLegPose(1.5, origin, origin, 0, true);
    expect(markTime[0].ankle[1]).toBeGreaterThan(markTime[1].ankle[1]);
    for (const leg of markTime) expect(leg.ankle[2]).toBeCloseTo(0);
    expect(sampleLegPose(0.5, origin, origin, 0, true)[1].ankle[1]).toBeGreaterThan(neutral[1].ankle[1]);
  });

  it('alternates reach and swing, with direction relative to facing', () => {
    const forward = sampleLegPose(0, origin, ahead, 0, false);
    const otherStep = sampleLegPose(1, origin, ahead, 0, false);
    expect(forward[0].ankle[2]).toBeGreaterThan(0);
    expect(otherStep[0].ankle[2]).toBe(-forward[0].ankle[2]);
    expect(sampleLegPose(0, origin, ahead, 180, false)[0].ankle[2]).toBeCloseTo(-forward[0].ankle[2]);
    const lateral = sampleLegPose(1, origin, ahead, 90, false);
    expect(lateral[1].ankle[0] - lateral[0].ankle[0]).toBeGreaterThan(0.139);
    expect(lateral[0].ankle[2]).toBeCloseTo(0);
    const swing = sampleLegPose(0.5, origin, ahead, 0, false);
    expect(swing[1].ankle[1]).toBeGreaterThan(swing[0].ankle[1]);
  });

  it.each<MotionScenario>(['hold', 'forward', 'mark', 'backward', 'lateral'])('samples %s deterministically after scrubbing, changing speed or wrapping a loop', scenario => {
    const project = createLegMotionFixture(64, scenario);
    const id = project.performers[0].id;
    const marked = scenario === 'mark' ? new Set([id]) : undefined;
    function pose(count: number) {
      const { positions, facings } = sampleProject(project, count);
      const frame = legMotionFrame(project, count, marked);
      return sampleLegPose(frame.count, positions[id], frame.nextPositions[id], facings?.[id], frame.markTime?.has(id) ?? false);
    }
    const count = 3.625;
    const seconds = countToSeconds(project, count);
    const length = countToSeconds(project, 8);
    const scrubbed = pose(count);
    for (const speed of [0.25, 1, 2]) {
      expect(pose(secondsToCount(project, (seconds / speed * speed + length * 2) % length))).toEqual(scrubbed);
    }
    pose(7.75);
    expect(pose(count)).toEqual(scrubbed);
    expect(pose(count + 2)).toEqual(scrubbed);
  });

  it.each<64 | 500>([64, 500])('generates a valid %i-performer fixture with shared authored facing', size => {
    const fixture = createLegMotionFixture(size, 'backward');
    const project = parseProject(serializeProject(fixture));
    expect(project.performers).toHaveLength(size);
    const { positions, facings } = sampleProject(project, 4);
    expect(Object.keys(positions)).toHaveLength(size);
    expect(Object.values(facings ?? {})).toEqual(Array(size).fill(0));
    for (const { x, y } of Object.values(positions)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(project.field.width);
      expect(y).toBeLessThan(project.field.height);
    }
  });

  it('transforms articulated joints and equipment axes by the shared facing and hides both batches for static fallback', () => {
    const scene = new Scene();
    const mesh = new LegMotionMeshes(scene, 16);
    mesh.begin(32, 20);
    const [segments, shoes] = scene.children as InstancedMesh[];
    expect([segments.count, shoes.count]).toEqual([80, 40]);
    const [pose] = sampleLegPose(0, origin, ahead, 0, false);
    mesh.setLeg(0, 5, 7, Math.PI / 2, pose);
    mesh.setLeg(1, 0, 0, 0);
    const matrix = new Matrix4();
    shoes.getMatrixAt(0, matrix);
    const shoe = new Vector3().setFromMatrixPosition(matrix);
    expect(shoe.x).toBeCloseTo(5 + pose.ankle[2] + 0.051);
    expect(shoe.z).toBeCloseTo(7 - pose.ankle[0]);
    shoes.getMatrixAt(1, matrix);
    expect(new Vector3().setFromMatrixScale(matrix).length()).toBe(0);
    mesh.hide();
    expect(scene.children.every(child => !child.visible)).toBe(true);
    mesh.begin(32, 1);
    expect(scene.children.every(child => child.visible)).toBe(true);
  });
});
