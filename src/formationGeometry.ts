import type { FormationKind, FormationOptions, Point, Project } from './types';
import { PROJECT_LIMITS } from './projectValidation';
import { formationCenter } from './formationAssignment';
import { affinePoint } from './transforms';
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function generateFormation(kind: FormationKind, count: number, options: FormationOptions): Point[] {
  if (!Number.isInteger(count) || count < 0 || count > PROJECT_LIMITS.performers) throw new Error(`Formation size must be an integer from 0 to ${PROJECT_LIMITS.performers}.`);
  if (![options.center.x, options.center.y, options.width, options.height, options.rotation, options.columns].every(Number.isFinite)) {
    throw new Error('Formation dimensions, center, rotation, and columns must be finite numbers.');
  }
  if (options.width < 0 || options.height < 0) throw new Error('Formation width and height cannot be negative.');
  if (!['line', 'arc', 'circle', 'block', 'curve'].includes(kind)) throw new Error('Unknown formation kind.');
  const radians = options.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const columns = clamp(Math.floor(options.columns), 1, Math.max(1, count));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    let x = 0;
    let y = 0;
    if (count > 1) {
      switch (kind) {
        case 'line': x = (t - 0.5) * options.width; break;
        case 'arc': {
          const angle = Math.PI * (1 - t);
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height - options.height / 2;
          break;
        }
        case 'circle': {
          const angle = index / count * Math.PI * 2 - Math.PI / 2;
          x = Math.cos(angle) * options.width / 2;
          y = Math.sin(angle) * options.height / 2;
          break;
        }
        case 'block': {
          const column = index % columns;
          const row = Math.floor(index / columns);
          x = columns === 1 ? 0 : (column / (columns - 1) - 0.5) * options.width;
          y = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * options.height;
          break;
        }
        case 'curve':
          x = (t - 0.5) * options.width;
          y = Math.sin((t - 0.5) * Math.PI * 2) * options.height / 2;
          break;
      }
    }
    return { x: options.center.x + x * cosine - y * sine, y: options.center.y + x * sine + y * cosine };
  });
}

type FormationSeed = Omit<FormationOptions, 'center'>;
const extent = (points: readonly Point[]) => points.reduce((b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
/** Every slot plus the center, which previewFormation also requires inside the field. */
const formationExtent = (kind: FormationKind, count: number, o: FormationOptions) => extent([...generateFormation(kind, count, o), o.center]);

/** Scale seeded parameters about their center (never up), then translate them so every
 * generated slot and the center lie inside the field. Seeding only: edits are never silently fit. */
export function fitFormationOptions(kind: FormationKind, count: number, o: FormationOptions, field: Project['field'], margin = 0): FormationOptions {
  const box = formationExtent(kind, count, o), width = field.width - 2 * margin, height = field.height - 2 * margin;
  const scale = Math.min(1, width / Math.max(1e-9, box.maxX - box.minX), height / Math.max(1e-9, box.maxY - box.minY));
  const scaled = scale < 1 ? { ...o, width: o.width * scale, height: o.height * scale } : o;
  const b = scale < 1 ? formationExtent(kind, count, scaled) : box;
  const shift = (min: number, max: number, limit: number) => min < margin ? margin - min : max > limit - margin ? limit - margin - max : 0;
  return { ...scaled, center: { x: o.center.x + shift(b.minX, b.maxX, field.width), y: o.center.y + shift(b.minY, b.maxY, field.height) } };
}

const nearestGap = (points: readonly Point[]) => {
  let gap = Infinity;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) gap = Math.min(gap, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  return gap;
};

/** First-use parameters for a shape: sized from the selection's footprint in the shape's
 * rotated frame, spread to the minimum spacing, then fit inside the field. Preferences
 * supply rotation and columns, the size for a selection without extent, and the deepest
 * depth-to-width proportion for arcs, circles and waves. */
export function defaultFormationOptions(kind: FormationKind, positions: Record<string, Point>, ids: readonly string[], preferred: FormationSeed, field: Project['field'], minimumSpacing: number, center = formationCenter(positions, ids)): FormationOptions {
  const pivot = formationCenter(positions, ids);
  const local = extent(ids.map(id => affinePoint(positions[id], pivot, -preferred.rotation, 1)));
  // Micro-yard rounding keeps seeded values readable (56, not 55.99999999999999); fitting below stays exact.
  const span = (min: number, max: number) => ids.length ? Math.round((max - min) * 1e6) / 1e6 : 0;
  const spanX = span(local.minX, local.maxX), spanY = span(local.minY, local.maxY);
  let width = preferred.width, height = preferred.height;
  if (Math.max(spanX, spanY) >= 1e-6) {
    const aspect = preferred.width > 0 ? preferred.height / preferred.width : .5;
    if (kind === 'line') width = Math.max(spanX, spanY);
    else if (kind === 'block') { width = spanX >= 1e-6 ? spanX : spanY / Math.max(aspect, 1e-6); height = spanY >= 1e-6 ? spanY : width * aspect; }
    else { width = spanX >= 1e-6 ? spanX : spanY; height = Math.min(width * aspect, Math.max(width / 4, spanY)); }
  }
  let options: FormationOptions = { ...preferred, width: Math.max(.1, width), height: Math.max(0, height), center };
  const gap = ids.length > 1 ? nearestGap(generateFormation(kind, ids.length, options)) : Infinity;
  // Uniform scaling multiplies every slot distance; a line has no depth to scale.
  if (gap > 1e-9 && gap < minimumSpacing) options = { ...options, width: options.width * minimumSpacing / gap, height: kind === 'line' ? options.height : options.height * minimumSpacing / gap };
  options = { ...options, width: Math.min(200, options.width), height: Math.min(200, options.height) };
  return fitFormationOptions(kind, ids.length, options, field);
}
