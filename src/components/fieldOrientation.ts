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
 * Yards of apron shown around the field at Fit. The sideline captions sit within 3.7 yd of the playing surface,
 * and the controls that float over the canvas stay inside this margin, so the field itself fills the window.
 */
export const FIELD_FIT_MARGIN = { x: 4, y: 4 } as const;
/** The 2D viewBox for a zoom (clamped by the caller) and a pan offset in field yards. */
/** The apron for a surface of any size: a football field's margin, in proportion for a smaller floor or stage. */
export function fieldFitMargin(field: Pick<Project['field'], 'width' | 'height'>) {
  const share = (size: number, full: number) => Math.min(1, Math.max(.3, size / full));
  return { x: FIELD_FIT_MARGIN.x * share(field.width, 100), y: FIELD_FIT_MARGIN.y * share(field.height, 160 / 3) };
}
export function fieldViewBox(field: Pick<Project['field'], 'width' | 'height'>, zoom: number, pan: Point) {
  const margin = fieldFitMargin(field);
  const width = (field.width + margin.x * 2) / zoom;
  const height = (field.height + margin.y * 2) / zoom;
  return { x: field.width / 2 + pan.x - width / 2, y: field.height / 2 + pan.y - height / 2, width, height };
}
