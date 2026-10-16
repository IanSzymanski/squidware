import { generateFormation } from './domain';
import type { FormationKind, FormationOptions, Point, Project } from './types';
import { affinePoint } from './transforms';

export interface FormationSession {
  revision: number; setId: string; ids: string[]; kind: FormationKind; options: FormationOptions;
}
export interface FormationResult {
  positions: Record<string, Point>; updates: Record<string, Point>; changed: boolean; error: string | null;
}
export type FormationHandle = 'start' | 'end' | 'width' | 'depth' | 'bulge' | 'rotate' | 'center';
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Preview and acceptance use these exact destinations. Never silently fit a shape. */
export function previewFormation(positions: Record<string, Point>, ids: readonly string[], kind: FormationKind, options: FormationOptions, field: Project['field']): FormationResult {
  try {
    if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(positions, id))) throw new Error('Select performers on this set before shaping.');
    if (![options.center.x, options.center.y].every(Number.isFinite) || options.center.x < 0 || options.center.y < 0 || options.center.x > field.width || options.center.y > field.height) throw new Error('The formation center must be inside the field.');
    if (!Number.isInteger(options.columns) || options.columns < 1 || options.columns > 500) throw new Error('Block columns must be a whole number from 1 to 500.');
    if (options.width < .1 || options.width > 200 || options.height < 0 || options.height > 200 || Math.abs(options.rotation) > 3600) throw new Error('Use width 0.1–200 yd, depth 0–200 yd and rotation −3600°–3600°.');
    const points = generateFormation(kind, ids.length, options);
    let changed = false;
    let outside = false;
    const updates = Object.fromEntries(ids.map((id, index) => {
      const point = points[index];
      if (point.x < -1e-8 || point.y < -1e-8 || point.x > field.width + 1e-8 || point.y > field.height + 1e-8) outside = true;
      const after = { x: Math.abs(point.x) < 1e-8 ? 0 : point.x, y: Math.abs(point.y) < 1e-8 ? 0 : point.y };
      // Absorb floating-point overshoot at the far edges too.
      if (Math.abs(after.x - field.width) < 1e-8) after.x = field.width;
      if (Math.abs(after.y - field.height) < 1e-8) after.y = field.height;
      if (Math.hypot(after.x - positions[id].x, after.y - positions[id].y) > 1e-9) changed = true;
      return [id, after];
    }));
    return { updates, positions: { ...positions, ...updates }, changed, error: outside ? 'The preview crosses a field boundary. Move its center or reduce its dimensions before applying.' : null };
  } catch (error) { return { positions, updates: {}, changed: false, error: (error as Error).message }; }
}

export function formationPoint(options: FormationOptions, x: number, y: number): Point {
  return affinePoint({ x: options.center.x + x, y: options.center.y + y }, options.center, options.rotation, 1);
}

/** All handles express edits as the same parameters used by numeric entry. */
export function formationHandleValue(kind: FormationKind, options: FormationOptions, handle: FormationHandle, start: Point, current: Point, field: Project['field']): FormationOptions {
  const bounded = (n: number, min = 0) => round(Math.max(min, Math.min(200, n)));
  if (handle === 'center') return { ...options, center: { x: round(Math.max(0, Math.min(field.width, options.center.x + current.x - start.x))), y: round(Math.max(0, Math.min(field.height, options.center.y + current.y - start.y))) } };
  if (handle === 'rotate') {
    const delta = Math.atan2(current.y-options.center.y,current.x-options.center.x) - Math.atan2(start.y-options.center.y,start.x-options.center.x);
    return { ...options, rotation: round(Math.max(-3600, Math.min(3600, options.rotation + Math.atan2(Math.sin(delta),Math.cos(delta))*180/Math.PI))) };
  }
  if (handle === 'start' || handle === 'end') {
    const baselineY = kind === 'arc' ? -options.height / 2 : 0;
    const fixed = formationPoint(options, handle === 'start' ? options.width/2 : -options.width/2, baselineY);
    const left = handle === 'start' ? current : fixed;
    const right = handle === 'end' ? current : fixed;
    const angle = Math.atan2(right.y-left.y,right.x-left.x);
    const offset = kind === 'arc' ? options.height/2 : 0;
    return { ...options, width: bounded(Math.hypot(right.x-left.x,right.y-left.y), .1), rotation: round(angle*180/Math.PI),
      center: { x: round((left.x+right.x)/2 - Math.sin(angle)*offset), y: round((left.y+right.y)/2 + Math.cos(angle)*offset) } };
  }
  const local = affinePoint(current, options.center, -options.rotation, 1);
  if (handle === 'width') return { ...options, width: bounded(2*(local.x-options.center.x), .1) };
  if (handle === 'bulge') {
    const height = bounded(local.y-options.center.y + options.height/2);
    const shift = (height-options.height)/2;
    const radians = options.rotation*Math.PI/180;
    return { ...options, height, center: { x: round(options.center.x-Math.sin(radians)*shift), y: round(options.center.y+Math.cos(radians)*shift) } };
  }
  return { ...options, height: bounded(2*(local.y-options.center.y)) };
}
