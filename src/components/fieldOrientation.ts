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
