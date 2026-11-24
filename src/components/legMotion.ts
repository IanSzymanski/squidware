import type { LowerBodyCuePose } from '../choreography';
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
  toeYaw?: number;
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

/** The right ankle is the drill dot. The left foot steps out before the bend. */
export function sampleCueLegPose({ spread, turnout, drop }: LowerBodyCuePose) {
  const leftAnkleX = -2 * halfStance - .32 * spread;
  const bodyX = leftAnkleX / 2;
  const leg = (side: number): LegPose => {
    const hipX = bodyX + side * halfStance;
    const ankleX = side < 0 ? leftAnkleX : 0;
    const lift = side < 0 && spread > 0 && spread < 1 ? .07 * Math.sin(Math.PI * spread) : 0;
    const ankleY = ankleHeight + lift;
    const hipY = hipHeight - drop;
    const yaw = side * turnout * Math.PI / 180;
    const kneeBend = .027 + drop * .63;
    return {
      hip: [hipX, hipY, 0],
      knee: [(hipX + ankleX) / 2 + Math.sin(yaw) * kneeBend, (hipY + ankleY) / 2, Math.cos(yaw) * kneeBend],
      ankle: [ankleX, ankleY, 0],
      toeYaw: yaw,
    };
  };
  return { legs: [leg(-1), leg(1)] as const, bodyX };
}
