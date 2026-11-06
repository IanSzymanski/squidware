import type { Point, Project } from '../types';
export type FieldOrientation = 'audience-bottom' | 'audience-top';
/** A half-turn is its own inverse. Only the view changes; drill points stay canonical. */
export function fieldViewPoint(point: Point, field: Pick<Project['field'], 'width' | 'height'>, orientation: FieldOrientation): Point {
  return orientation === 'audience-top' ? { x: field.width - point.x, y: field.height - point.y } : point;
}
export function fieldViewTransform(field: Project['field'], orientation: FieldOrientation) {
  return orientation === 'audience-top' ? `translate(${field.width} ${field.height}) rotate(180)` : undefined;
}
/** Arrow keys follow screen direction in both field focus and global shortcuts. */
export function fieldDirection(key: string, step: number, orientation: FieldOrientation) {
  const distance = orientation === 'audience-top' ? -step : step;
  return { dx: key === 'ArrowLeft' ? -distance : key === 'ArrowRight' ? distance : 0,
    dy: key === 'ArrowUp' ? -distance : key === 'ArrowDown' ? distance : 0 };
}
/**
 * Yards of apron shown around the field at Fit. Sideline labels need about 5.1 yd above and 5.4 yd below the
 * playing surface; no permanent overlay covers the field, so the apron only needs to hold those labels.
 */
export const FIELD_FIT_MARGIN = { x: 4, y: 6 } as const;
/** The 2D viewBox for a zoom (clamped by the caller) and a pan offset in field yards. */
export function fieldViewBox(field: Pick<Project['field'], 'width' | 'height'>, zoom: number, pan: Point) {
  const width = (field.width + FIELD_FIT_MARGIN.x * 2) / zoom;
  const height = (field.height + FIELD_FIT_MARGIN.y * 2) / zoom;
  return { x: field.width / 2 + pan.x - width / 2, y: field.height / 2 + pan.y - height / 2, width, height };
}
