import type { Point, Project } from '../types';
import { fieldViewPoint, type FieldOrientation } from './fieldOrientation';
import { layoutFieldLabels, type FieldPresentation, type ScreenBox } from './fieldPresentation';

export interface FieldScreen { scale: number; bounds: ScreenBox; pixelRatio?: number }
export function fieldDotColor(sectionColor: string, selected: boolean, display: FieldPresentation) {
  return display.colorMode === 'section' ? sectionColor : display.colorMode === 'custom' ? display.customColor : selected ? '#8dc8ff' : '#b3c5bd';
}
export function measureFieldLabels(project: Project, fontSize: number) {
  const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  if (context) context.font = `700 ${fontSize}px Arial, sans-serif`;
  return new Map(project.performers.map(person => [person.id, context?.measureText(person.label).width ?? person.label.length * fontSize]));
}
/** The SVG and canvas use identical collision placement in CSS pixels. */
export function fieldLabels(project: Project, positions: Record<string, Point>, selected: ReadonlySet<string>, focusedId: string | null | undefined, display: FieldPresentation, screen: FieldScreen, orientation: FieldOrientation, widths: Map<string, number>) {
  return layoutFieldLabels(project.performers.flatMap(person => {
    const point = positions[person.id];
    if (!point) return [];
    const view = fieldViewPoint(point, project.field, orientation);
    return [{ id: person.id, x: view.x * screen.scale, y: view.y * screen.scale, labelWidth: widths.get(person.id)!, selected: selected.has(person.id), focused: focusedId === person.id }];
  }), screen.bounds, display);
}
/** Bound allocation on very large/high-DPI displays while retaining CSS geometry. */
export function fieldCanvasSize(width: number, height: number, pixelRatio: number) {
  const ratio = Math.min(Math.max(1, pixelRatio || 1), 4, Math.sqrt(16_000_000 / Math.max(1, width * height)));
  return { width: Math.max(1, Math.ceil(width * ratio)), height: Math.max(1, Math.ceil(height * ratio)), ratio };
}
