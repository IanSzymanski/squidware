import type { MarchingDirection, PerformerAppearance, PerformerFacings, PerformerPath, Point, Project } from './types';
import { validateEquipment } from './equipment';
import { movementTravels } from './movementPaths';

const invalid = (path: string, reason: string): never => { throw new Error(`Invalid project: ${path} ${reason}`); };
const degrees = Math.PI / 180;
const wrap = (angle: number) => ((angle % 360) + 360) % 360;

export function validateFacings(value: unknown, ids: ReadonlySet<string>, path: string): PerformerFacings | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must map performers to degrees.');
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [id, angle] of entries) {
    if (!ids.has(id)) invalid(`${path}.${id}`, 'must reference an existing performer.');
    if (typeof angle !== 'number' || !Number.isFinite(angle) || angle < 0 || angle >= 360) invalid(`${path}.${id}`, 'must be a finite angle from 0 up to 360 degrees.');
  }
  return entries.length ? Object.fromEntries(entries) as PerformerFacings : undefined;
}

export function validateAppearance(value: unknown, path: string): PerformerAppearance | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an appearance object.');
  const { role, costumeColor, equipment, flagColor } = value as Record<string, unknown>;
  if (role !== undefined && role !== 'instrument' && role !== 'guard') invalid(`${path}.role`, 'must be instrument or guard.');
  const color = (value: unknown, key: string) => {
    if (value === undefined) return;
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return invalid(`${path}.${key}`, 'must be a six-digit hex color.');
    return value;
  };
  const costume = color(costumeColor, 'costumeColor');
  const flag = color(flagColor, 'flagColor');
  const model = validateEquipment(equipment, `${path}.equipment`);
  if (role === undefined && costume === undefined && model === undefined && flag === undefined) return;
  return { ...(role === undefined ? {} : { role: role as PerformerAppearance['role'] }),
    ...(costume === undefined ? {} : { costumeColor: costume }),
    ...(model === undefined ? {} : { equipment: model }),
    ...(flag === undefined ? {} : { flagColor: flag }) };
}

export function facingAt(facings: PerformerFacings | undefined, id: string): number | undefined {
  const angle = facings?.[id];
  return typeof angle === 'number' ? angle : undefined;
}

/** Angles use field axes. A half-turn proceeds toward increasing degrees. */
export function sampleFacings(project: Project, setIndex: number, progress: number): PerformerFacings | undefined {
  const to = project.sets[setIndex]?.facings;
  if (setIndex === 0 || progress === 1) return to;
  const from = project.sets[setIndex - 1]?.facings;
  if (progress === 0) return from;
  if (!from || !to) return;
  const facings = Object.entries(from).flatMap(([id, angle]) => {
    const target = facingAt(to, id);
    if (target === undefined) return [];
    if (target === angle) return [[id, angle] as const];
    const arc = wrap(target - angle + 180) - 180;
    return [[id, wrap(angle + progress * (arc === -180 ? 180 : arc))] as const];
  });
  return facings.length ? Object.fromEntries(facings) : undefined;
}

export function describeFacing(angle: number | undefined): string {
  return angle === undefined ? '' : `Facing ${Number(angle.toFixed(2))}°`;
}

export function facingVector(angle: number): Point {
  return { x: Math.sin(angle * degrees), y: Math.cos(angle * degrees) };
}

/** Each cubic velocity is a convex combination of control-edge vectors. A
 * single 90-degree cone bounds direction only when every nonzero edge agrees. */
export function directionFromFacing(from: Point, to: Point, path: PerformerPath | undefined, start?: number, end?: number): MarchingDirection | undefined {
  if (start === undefined || start !== end) return;
  const heading = facingVector(start);
  let cone: 'forward' | 'backward' | 'left' | 'right' | undefined;
  for (const travel of movementTravels(from, to, path)) {
    const points = travel.segment.kind === 'cubic'
      ? [travel.from, travel.segment.control1, travel.segment.control2, travel.to] : [travel.from, travel.to];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
      if (dx === 0 && dy === 0) continue;
      const along = dx * heading.x + dy * heading.y;
      const across = dx * heading.y - dy * heading.x;
      if (Math.abs(Math.abs(along) - Math.abs(across)) <= 1e-10 * Math.hypot(dx, dy)) return;
      const next = Math.abs(along) > Math.abs(across) ? along > 0 ? 'forward' : 'backward' : across > 0 ? 'right' : 'left';
      if (cone && cone !== next) return;
      cone = next;
    }
  }
  return cone === 'left' || cone === 'right' ? 'sideways' : cone;
}
