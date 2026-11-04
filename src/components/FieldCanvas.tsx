import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { selectionMembership } from '../selection';
import type { Point, Project } from '../types';
import type { NeighborOverlay, NeighborPath } from '../neighborPaths';
import type { SelectionReview } from '../selectionTools';
import type { FieldPresentation } from './fieldPresentation';
import { fieldViewPoint, type FieldOrientation } from './fieldOrientation';
import { fieldCanvasSize, fieldDotColor, fieldLabels, measureFieldLabels, type FieldScreen } from './fieldScene';

interface Props {
  project: Project; positions: Record<string, Point>; selectedIds: string[];
  display: FieldPresentation; screen: FieldScreen; orientation: FieldOrientation;
  focusedId: string | null; showLabels: boolean; enabled: boolean;
  neighbors?: NeighborOverlay[]; selectionPreview?: SelectionReview | null;
  snapPreview: Record<string, Point>; original: Record<string, Point>;
  onReady: (ready: boolean) => void;
}
/** Dynamic pixels only. Input, focus and export remain in the shared SVG layer. */
export function FieldCanvas({ project, positions, selectedIds, display, screen, orientation, focusedId, showLabels, enabled, neighbors, selectionPreview, snapPreview, original, onReady }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lost = useRef(false);
  const sprites = useRef(new Map<string, HTMLCanvasElement>());
  const accentCache = useRef('');
  const [generation, setGeneration] = useState(0);
  const widths = useMemo(() => measureFieldLabels(project, display.labelSizePx), [project.performers, display.labelSizePx]);
  const paths = useRef(new WeakMap<NeighborPath, { path: Path2D; end: Point; angle: number }>());
  const { scale, bounds } = screen;
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top;
  useLayoutEffect(() => {
    const canvas = ref.current!;
    const fail = () => { lost.current = true; canvas.style.visibility = 'hidden'; onReady(false); };
    const restore = () => { lost.current = false; setGeneration(value => value + 1); };
    const theme = new MutationObserver(() => { accentCache.current = ''; setGeneration(value => value + 1); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    canvas.addEventListener('contextlost', fail);
    canvas.addEventListener('contextrestored', restore);
    return () => { theme.disconnect(); canvas.removeEventListener('contextlost', fail); canvas.removeEventListener('contextrestored', restore); onReady(false); };
  }, [onReady]);
  useLayoutEffect(() => {
    const canvas = ref.current!;
    if (!enabled || lost.current) { canvas.style.visibility = 'hidden'; onReady(false); return; }
    try {
      const context = canvas.getContext('2d');
      if (!context || context.isContextLost()) { lost.current = true; canvas.style.visibility = 'hidden'; onReady(false); return; }
      const size = fieldCanvasSize(width, height, screen.pixelRatio ?? window.devicePixelRatio);
      if (canvas.width !== size.width || canvas.height !== size.height) { canvas.width = size.width; canvas.height = size.height; }
      // Ceil allocation never changes world-to-CSS-pixel scale.
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(size.ratio, 0, 0, size.ratio, -bounds.left * size.ratio, -bounds.top * size.ratio);
      const selected = selectionMembership(selectedIds);
      const colors = new Map(project.sections.map(section => [section.id, section.color]));
      const accent = accentCache.current ||= getComputedStyle(canvas).getPropertyValue('--field-accent').trim() || '#91c1ff';
      const spriteKey = `${display.dotRadiusPx}/${size.ratio}/${accent}/${project.sections.map(s => s.color).join(',')}/${display.colorMode}/${display.customColor}`;
      if (canvas.dataset.spriteKey !== spriteKey) { sprites.current.clear(); canvas.dataset.spriteKey = spriteKey; }
      const circle = (x: number, y: number, radius: number) => { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); };
      const view = (point: Point) => { const p = fieldViewPoint(point, project.field, orientation); return { x: p.x * scale, y: p.y * scale }; };
      context.save();
      context.scale(scale, scale);
      if (orientation === 'audience-top') { context.translate(project.field.width, project.field.height); context.rotate(Math.PI); }
      for (const overlay of neighbors ?? []) {
        const incoming = overlay.direction === 'previous';
        context.strokeStyle = incoming ? '#b9e3f4' : '#f1d39a'; context.lineWidth = 1.5 / scale;
        context.lineCap = 'round';
        for (const path of overlay.paths) {
          if (path.moving) {
            let cached = paths.current.get(path);
            if (!cached) {
              // SVG's exact end tangent also covers cubic, scheduled and generated group paths.
              const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svgPath.setAttribute('d', path.svg);
              const length = svgPath.getTotalLength(), end = svgPath.getPointAtLength(length), before = svgPath.getPointAtLength(Math.max(0, length - .001));
              cached = { path: new Path2D(path.svg), end, angle: Math.atan2(end.y - before.y, end.x - before.x) }; paths.current.set(path, cached);
            }
            context.globalAlpha = .8; context.setLineDash(incoming ? [6 / scale, 4 / scale] : [1 / scale, 4 / scale]); context.stroke(cached.path); context.setLineDash([]);
            context.save(); context.translate(cached.end.x, cached.end.y); context.rotate(cached.angle);
            // The SVG marker's 6px viewport scales with its 1.5px stroke.
            context.beginPath(); context.moveTo(-6.75 / scale, -3.375 / scale); context.lineTo(0, 0); context.lineTo(-6.75 / scale, 3.375 / scale); context.lineWidth = 1.6875 / scale; context.stroke(); context.restore(); context.globalAlpha = 1;
          }
          const ghost = incoming ? path.from : path.to;
          if (incoming) circle(ghost.x, ghost.y, 4 / scale);
          else { context.beginPath(); context.moveTo(ghost.x, ghost.y - 5 / scale); context.lineTo(ghost.x + 5 / scale, ghost.y); context.lineTo(ghost.x, ghost.y + 5 / scale); context.lineTo(ghost.x - 5 / scale, ghost.y); context.closePath(); }
          context.stroke();
        }
      }
      context.restore();
      const labels = fieldLabels(project, positions, selected, focusedId, { ...display, labelMode: showLabels ? display.labelMode : 'none' }, screen, orientation, widths);
      const radius = display.dotRadiusPx;
      for (const person of project.performers) {
        const point = positions[person.id]; if (!point) continue;
        const p = view(point), isSelected = selected.has(person.id);
        const color = fieldDotColor(colors.get(person.sectionId) ?? '#b9ed85', isSelected, display);
        if (focusedId === person.id) {
          context.strokeStyle = accent; context.lineWidth = 2; const r = radius + 5;
          context.beginPath(); context.roundRect(p.x - r, p.y - r, r * 2, r * 2, 1); context.stroke();
        }
        const key = `${color}/${isSelected}`;
        let sprite = sprites.current.get(key);
        const pad = radius + 6, side = pad * 2;
        if (!sprite) {
          sprite = document.createElement('canvas'); sprite.width = Math.ceil(side * size.ratio); sprite.height = Math.ceil(side * size.ratio);
          const ink = sprite.getContext('2d'); if (!ink) throw new Error('Unavailable dot canvas.');
          ink.scale(size.ratio, size.ratio);
          const dotCircle = (r: number, x = pad, y = pad) => { ink.beginPath(); ink.arc(x, y, r, 0, Math.PI * 2); };
          if (isSelected) {
            dotCircle(radius + 3); ink.strokeStyle = '#111820'; ink.lineWidth = 4; ink.stroke();
            ink.strokeStyle = accent; ink.lineWidth = 1.5; ink.stroke();
          }
          dotCircle(radius); ink.fillStyle = color; ink.fill(); ink.strokeStyle = isSelected ? '#fff' : '#142920'; ink.lineWidth = 1; ink.stroke();
          dotCircle(radius / 4, pad - radius * .23, pad - radius * .27); ink.fillStyle = '#fff'; ink.globalAlpha = .3; ink.fill();
          sprites.current.set(key, sprite);
        }
        context.drawImage(sprite, p.x - pad, p.y - pad, sprite.width / size.ratio, sprite.height / size.ratio);
        const label = labels.get(person.id);
        if (label) {
          context.font = `${isSelected ? 700 : 500} ${display.labelSizePx}px Arial, sans-serif`; context.textBaseline = 'alphabetic'; context.lineJoin = 'miter';
          context.strokeStyle = '#1c3026'; context.lineWidth = 3; context.strokeText(person.label, label.left + 2, label.top + 2 + display.labelSizePx * .8);
          context.fillStyle = isSelected ? '#fff' : '#e0e9de'; context.fillText(person.label, label.left + 2, label.top + 2 + display.labelSizePx * .8);
        }
      }
      if (selectionPreview) {
        const included = selectionMembership(selectionPreview.ids);
        for (const candidate of selectionPreview.candidates) {
          const point = positions[candidate.id]; if (!point) continue;
          const p = view(point); circle(p.x, p.y, 11); context.lineWidth = 2;
          context.strokeStyle = included.has(candidate.id) ? '#fff4b1' : '#ffcb83'; context.setLineDash(included.has(candidate.id) ? [] : [3, 2]); context.stroke();
        }
        context.setLineDash([]);
      }
      context.strokeStyle = '#fff'; context.lineWidth = 1; context.setLineDash([.4 * scale, .3 * scale]);
      context.beginPath();
      for (const [id, point] of Object.entries(snapPreview)) {
        if (!original[id]) continue;
        const from = view(original[id]), to = view(point); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
      }
      context.stroke(); context.setLineDash([]); canvas.style.visibility = 'visible'; onReady(true);
    } catch {
      // A failed allocation/context must leave the editable vector renderer usable.
      lost.current = true; canvas.style.visibility = 'hidden'; onReady(false);
    }
  }, [project, positions, selectedIds, display, screen, orientation, focusedId, showLabels, enabled, neighbors, selectionPreview, snapPreview, original, onReady, generation, scale, bounds, width, height]);
  return <canvas ref={ref} data-field-canvas="true" aria-hidden="true" className="field-stage__canvas" />;
}
