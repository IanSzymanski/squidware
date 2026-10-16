import type { Point, Project } from './types';

export type FieldPivot = 'center' | 'back-hash' | 'front-hash' | 'back-left' | 'back-right' | 'front-left' | 'front-right';
export type TransformPivot = { kind: 'centroid' } | { kind: 'performer'; id: string } | { kind: 'custom'; point: Point } | { kind: 'field'; reference: FieldPivot };
export type TransformOperation = 'rotate-scale' | 'across-50' | 'front-back';
export interface ExactTransform { operation: TransformOperation; angle: number; scale: number; pivot: TransformPivot }
export interface TransformSession { revision: number; setId: string; ids: string[]; options: ExactTransform }
export interface TransformResult {
  positions: Record<string, Point>; updates: Record<string, Point>; pivot: Point | null; error: string | null; changed: boolean;
}

export const defaultTransform = (): ExactTransform => ({ operation: 'rotate-scale', angle: 0, scale: 1, pivot: { kind: 'centroid' } });

/** Screen coordinates increase toward the front sideline, so positive angles turn clockwise. */
export function affinePoint(point: Point, pivot: Point, angle: number, scale: number): Point {
  const radians = angle * Math.PI / 180;
  const x = (point.x - pivot.x) * scale; const y = (point.y - pivot.y) * scale;
  return { x: pivot.x + x * Math.cos(radians) - y * Math.sin(radians), y: pivot.y + x * Math.sin(radians) + y * Math.cos(radians) };
}

export function fieldPivot(field: Project['field'], reference: FieldPivot): Point {
  const hash = field.preset === 'college' ? 20 : field.height / 3;
  switch (reference) {
    case 'center': return { x: field.width / 2, y: field.height / 2 };
    case 'back-hash': return { x: field.width / 2, y: hash };
    case 'front-hash': return { x: field.width / 2, y: field.height - hash };
    case 'back-left': return { x: 0, y: 0 };
    case 'back-right': return { x: field.width, y: 0 };
    case 'front-left': return { x: 0, y: field.height };
    case 'front-right': return { x: field.width, y: field.height };
    default: throw new Error('Choose a supported field pivot.');
  }
}

export function resolveTransformPivot(positions: Record<string, Point>, ids: string[], pivot: TransformPivot, field: Project['field']): Point {
  let point: Point;
  switch (pivot?.kind) {
    case 'centroid': point = ids.reduce((sum, id) => ({ x: sum.x + positions[id].x / ids.length, y: sum.y + positions[id].y / ids.length }), { x: 0, y: 0 }); break;
    case 'performer': {
      if (!Object.hasOwn(positions, pivot.id)) throw new Error('The pivot performer is not on this set.');
      point = positions[pivot.id]; break;
    }
    case 'custom': point = pivot.point; break;
    case 'field': point = fieldPivot(field, pivot.reference); break;
    default: throw new Error('Choose a supported pivot.');
  }
  if (!point || ![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.y < 0 || point.x > field.width || point.y > field.height) throw new Error('The pivot must be a finite point inside the field.');
  return point;
}

/** Exact tools reject out-of-field results; they never translate, shrink or clamp a group to fit. */
export function previewExactTransform(positions: Record<string, Point>, ids: readonly string[], options: ExactTransform, field: Project['field']): TransformResult {
  try {
    const selected = [...new Set(ids)];
    if (!selected.length || selected.some(id => !Object.hasOwn(positions, id))) throw new Error('Choose performers on this set before transforming.');
    if (!['rotate-scale', 'across-50', 'front-back'].includes(options.operation)) throw new Error('Choose a supported transform.');
    if (!Number.isFinite(options.angle) || Math.abs(options.angle) > 3600) throw new Error('Rotation must be between −3600° and 3600°.');
    if (!Number.isFinite(options.scale) || options.scale < .01 || options.scale > 100) throw new Error('Scale must be between 1% and 10000%.');
    const pivot = resolveTransformPivot(positions, selected, options.pivot, field);
    let outside = false; let changed = false;
    const updates = Object.fromEntries(selected.map(id => {
      const before = positions[id];
      let after = options.operation === 'across-50' ? { x: field.width - before.x, y: before.y }
        : options.operation === 'front-back' ? { x: before.x, y: field.height - before.y }
          : affinePoint(before, pivot, options.angle, options.scale);
      if (![after.x, after.y].every(Number.isFinite) || after.x < -1e-8 || after.x > field.width + 1e-8 || after.y < -1e-8 || after.y > field.height + 1e-8) outside = true;
      else after = { x: Math.max(0, Math.min(field.width, after.x)), y: Math.max(0, Math.min(field.height, after.y)) };
      if (Math.abs(after.x - before.x) > 1e-9 || Math.abs(after.y - before.y) > 1e-9) changed = true;
      return [id, after];
    }));
    return { positions: { ...positions, ...updates }, updates, pivot, changed, error: outside ? 'The preview crosses a field boundary. Reduce the angle or scale, or choose another pivot.' : null };
  } catch (error) {
    return { positions, updates: {}, pivot: null, changed: false, error: (error as Error).message };
  }
}

export type TransformHandle = 'rotate' | 'scale' | 'pivot';
/** Pointer gestures update the same parameters used by typed entry, in field coordinates. */
export function transformHandleValue(options: ExactTransform, handle: TransformHandle, pivot: Point, start: Point, current: Point, field: Project['field']): ExactTransform {
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  if (handle === 'pivot') return { ...options, pivot: { kind: 'custom', point: { x: round(Math.max(0, Math.min(field.width, current.x))), y: round(Math.max(0, Math.min(field.height, current.y))) } } };
  if (handle === 'scale') {
    const distance = Math.hypot(start.x - pivot.x, start.y - pivot.y);
    return { ...options, scale: round(Math.max(.01, Math.min(100, options.scale * Math.hypot(current.x - pivot.x, current.y - pivot.y) / Math.max(distance, 1e-6)))) };
  }
  const delta = Math.atan2(current.y - pivot.y, current.x - pivot.x) - Math.atan2(start.y - pivot.y, start.x - pivot.x);
  const degrees = Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
  return { ...options, angle: round(Math.max(-3600, Math.min(3600, options.angle + degrees))) };
}
