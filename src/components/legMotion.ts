import { facingVector } from '../performerFacing';
import type { Point } from '../types';

export interface LegMotionFrame {
  count: number;
  nextPositions: Readonly<Record<string, Point>>;
  markTime?: ReadonlySet<string>;
}

type Joint = readonly [x: number, y: number, z: number];
export interface LegPose {
  hip: Joint;
  knee: Joint;
  ankle: Joint;
}

const hipHeight = 0.59;
const ankleHeight = 0.14;
const halfStance = 0.105;
export const LEG_MOTION_LOOKAHEAD = 1 / 32;

/** Local x is the performer's right, +y is up and +z points toward their toes. */
export function sampleLegPose(count: number, position: Point, next: Point | undefined, facing: number | undefined, markTime: boolean): readonly [LegPose, LegPose] {
  const dx = next ? next.x - position.x : 0;
  const dy = next ? next.y - position.y : 0;
  const distance = Math.hypot(dx, dy);
  const traveling = facing !== undefined && distance > 1e-6;
  const stepping = traveling || markTime;
  const heading = facingVector(facing ?? 0);
  const lateral = traveling ? (dx * heading.y - dy * heading.x) / distance : 0;
  const forward = traveling ? (dx * heading.x + dy * heading.y) / distance : 0;
  const phase = (count % 2) * Math.PI;
  const reach = stepping ? Math.cos(phase) : 0;
  const swing = stepping ? Math.sin(phase) : 0;

  const leg = (side: number): LegPose => {
    const hipX = side * halfStance;
    // Lift the swinging foot on its way into the next step.
    const lift = Math.max(0, side * swing) * (traveling ? 0.105 : 0.15);
    const ankleX = hipX + side * (Math.abs(lateral) * 0.065 - reach * lateral * 0.088);
    const ankleZ = -side * reach * forward * 0.19;
    const ankleY = ankleHeight + lift;
    return {
      hip: [hipX, hipHeight, 0],
      knee: [(hipX + ankleX) / 2, (hipHeight + ankleY) / 2, ankleZ / 2 + 0.027 + lift * 0.52],
      ankle: [ankleX, ankleY, ankleZ],
    };
  };
  return [leg(-1), leg(1)];
}
