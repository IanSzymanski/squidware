import type { Point, Project } from './types';

export type CoordinatePrecision = 'whole' | 'half' | 'quarter' | 'decimal';
export interface CoordinateFormat {
  coordinatePrecision?: CoordinatePrecision;
  coordinateDecimals?: 0 | 1 | 2;
}
/** Numeric arguments retain the earlier decimal-place API. New clients use settings. */
export type CoordinateOptions = CoordinateFormat | 0 | 1 | 2;
export const COORDINATE_CONVENTIONS = '8-to-5 steps: 1 step = 0.625 yd. Side 1 is left on the chart; Side 2 is right. Front is the bottom. Inside means toward midfield; outside means toward a goal line. Move directions use field axes, not performer facing.';

function resolvedFormat(options: CoordinateOptions) {
  return typeof options === 'number' ? { coordinatePrecision: 'decimal' as const, coordinateDecimals: options }
    : { coordinatePrecision: options.coordinatePrecision ?? (options.coordinateDecimals === undefined ? 'quarter' : 'decimal'), coordinateDecimals: options.coordinateDecimals ?? 2 };
}

export function coordinatePrecisionLabel(options: CoordinateOptions = {}): string {
  const format = resolvedFormat(options);
  return format.coordinatePrecision === 'decimal' ? `Decimal steps (${format.coordinateDecimals ?? 2} ${(format.coordinateDecimals ?? 2) === 1 ? 'place' : 'places'})`
    : format.coordinatePrecision === 'whole' ? 'Whole steps' : format.coordinatePrecision === 'half' ? 'Half steps' : 'Quarter steps';
}

/** Step increments round halfway values away from zero; legacy decimals retain toFixed. */
function roundedSteps(distance: number, options: CoordinateOptions): number {
  const format = resolvedFormat(options);
  const precision = format.coordinatePrecision;
  if (precision === 'decimal') return Number((Math.abs(distance) * 8 / 5).toFixed(format.coordinateDecimals));
  const divisions = precision === 'whole' ? 1 : precision === 'half' ? 2 : 4;
  return Math.floor(Math.abs(distance) * 8 / 5 * divisions + .5 + 1e-9) / divisions;
}
const stepText = (value: number) => `${value} ${value === 1 ? 'step' : 'steps'}`;

export function coordinateDescription(point: Point, field: Project['field'], options: CoordinateOptions = {}): string {
  const side = point.x <= field.width / 2 ? 1 : 2;
  const fromGoal = side === 1 ? point.x : field.width - point.x;
  const half = field.width / 2;
  // Restrict references to the field: outside positions refer to a goal, never a negative yard line.
  const yardLine = Math.max(0, Math.min(half, Math.round(fromGoal / 5) * 5));
  const xDifference = fromGoal - yardLine;
  const xSteps = roundedSteps(xDifference, options);
  const reference = yardLine === 0 ? 'goal line' : `${Number(yardLine.toFixed(3))}-yard line`;
  const horizontal = xSteps === 0 ? `on the ${reference}` : `${stepText(xSteps)} ${xDifference > 0 ? 'inside' : 'outside'} the ${reference}`;
  const hashOffset = field.preset === 'college' ? 20 : 160 / 9;
  const references = [
    { name: 'back sideline', y: 0 }, { name: 'back hash', y: Math.min(hashOffset, field.height / 2) },
    { name: 'front hash', y: Math.max(field.height - hashOffset, field.height / 2) }, { name: 'front sideline', y: field.height },
  ];
  const nearest = references.reduce((best, ref) => Math.abs(point.y - ref.y) < Math.abs(point.y - best.y) - 1e-9 ? ref : best);
  const yDifference = point.y - nearest.y;
  const ySteps = roundedSteps(yDifference, options);
  const vertical = ySteps === 0 ? `on ${nearest.name}` : `${stepText(ySteps)} ${yDifference > 0 ? 'in front of' : 'behind'} ${nearest.name}`;
  return `${yardLine === half && xSteps === 0 ? `On the ${reference}` : `Side ${side}: ${horizontal}`}; ${vertical}`;
}
