import type { Point } from './types';

export type FootballSurface = { width: number; height: number; preset: 'college' | 'high-school' };
export type SurfaceUnit = 'yd' | 'ft' | 'm';
export interface SurfaceBackground {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type CustomSurface = {
  width: number;
  height: number;
  preset: 'indoor' | 'custom';
  unit: SurfaceUnit;
  referenceInterval: number;
  background?: SurfaceBackground;
};
export type Surface = FootballSurface | CustomSurface;

export const SURFACE_LIMITS = {
  minSize: 5, maxSize: 200, minReferenceYards: 1 / 3, maxReferenceYards: 200,
  imagePixels: 768, imageCharacters: 3_200_000,
} as const;
export const SURFACE_UNITS = { yd: 'Yards', ft: 'Feet', m: 'Meters' } as const;
export const FOOTBALL_SURFACE: FootballSurface = { width: 100, height: 160 / 3, preset: 'college' };
export const isCustomSurface = (field: Surface): field is CustomSurface => field.preset === 'indoor' || field.preset === 'custom';
export const SURFACE_NAMES = { college: 'College field', 'high-school': 'High school field', indoor: 'Indoor floor', custom: 'Custom stage' } as const;
export const yardsInUnit = (yards: number, unit: SurfaceUnit) => unit === 'ft' ? yards * 3 : unit === 'm' ? yards * .9144 : yards;
export const unitInYards = (value: number, unit: SurfaceUnit) => unit === 'ft' ? value / 3 : unit === 'm' ? value / .9144 : value;
export const surfaceUnits = (field: Surface) => isCustomSurface(field) ? field.unit : 'yd';
export const surfaceNumber = (value: number) => String(Number(value.toFixed(6)));
export const surfaceDimensionText = (field: Surface) => {
  const unit = surfaceUnits(field);
  return `${surfaceNumber(yardsInUnit(field.width, unit))} × ${surfaceNumber(yardsInUnit(field.height, unit))} ${unit}`;
};
export const surfaceCoordinateText = (point: Point, field: CustomSurface) =>
  `X ${surfaceNumber(yardsInUnit(point.x, field.unit))}, Y ${surfaceNumber(yardsInUnit(point.y, field.unit))} ${field.unit}`;
export const SURFACE_AXES = 'Origin at the back-left corner. X increases to the right and Y increases toward the audience edge.';

export function surfaceViewBox(field: Surface, x = 2, y = x) {
  return `${-x} ${-y} ${field.width + 2 * x} ${field.height + 2 * y}`;
}

export function surfaceReferences(field: CustomSurface, axis: keyof Point): number[] {
  const size = axis === 'x' ? field.width : field.height;
  const interval = unitInYards(field.referenceInterval, field.unit);
  const interior = Array.from({ length: Math.ceil(size / interval) - 1 }, (_, index) => (index + 1) * interval)
    .filter(position => position < size - 1e-8);
  return [0, ...interior, size];
}

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid project: field${path} ${reason}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object.');
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(path, `must be between ${surfaceNumber(minimum)} and ${surfaceNumber(maximum)}.`);
  }
  return value;
}

function validateImage(value: unknown): string {
  const prefix = 'data:image/png;base64,';
  if (typeof value !== 'string' || value.length > SURFACE_LIMITS.imageCharacters || !value.startsWith(prefix)) {
    invalid('.background.image', 'must be a bounded, embedded PNG image.');
  }
  const encoded = value.slice(prefix.length);
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) invalid('.background.image', 'contains invalid base64.');
  const header = atob(encoded.slice(0, 32));
  const signature = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR';
  const view = new DataView(Uint8Array.from(header, c => c.charCodeAt(0)).buffer);
  if (!header.startsWith(signature) || header.length !== 24 || [view.getUint32(16), view.getUint32(20)].some(n => n < 1 || n > SURFACE_LIMITS.imagePixels)) {
    invalid('.background.image', 'must be a PNG no larger than 768 pixels on either axis.');
  }
  const tail = atob(encoded.slice(-24));
  if (!tail.endsWith('\x00\x00\x00\x00IEND\xaeB\x60\x82')) invalid('.background.image', 'is an incomplete PNG.');
  return value;
}

export function validateFootballSurface(input: unknown): FootballSurface {
  const field = record(input, '');
  if (field.preset !== 'college' && field.preset !== 'high-school') invalid('.preset', 'must be college or high-school.');
  number(field.width, '.width', 100, 100);
  number(field.height, '.height', FOOTBALL_SURFACE.height - .001, FOOTBALL_SURFACE.height + .001);
  return { ...FOOTBALL_SURFACE, preset: field.preset };
}

export function validateSurface(input: unknown): Surface {
  const field = record(input, '');
  if (field.preset !== 'indoor' && field.preset !== 'custom') return validateFootballSurface(field);
  if (field.unit !== 'yd' && field.unit !== 'ft' && field.unit !== 'm') invalid('.unit', 'must be yards, feet or meters.');
  const { minSize, maxSize, minReferenceYards, maxReferenceYards } = SURFACE_LIMITS;
  const width = number(field.width, '.width', minSize, maxSize);
  const height = number(field.height, '.height', minSize, maxSize);
  const referenceInterval = number(field.referenceInterval, '.referenceInterval', yardsInUnit(minReferenceYards, field.unit), yardsInUnit(maxReferenceYards, field.unit));
  const result: CustomSurface = { preset: field.preset, width, height, unit: field.unit, referenceInterval };
  if (field.background !== undefined) {
    const background = record(field.background, '.background');
    const x = number(background.x, '.background.x', 0, width);
    const y = number(background.y, '.background.y', 0, height);
    const imageWidth = number(background.width, '.background.width', .01, width);
    const imageHeight = number(background.height, '.background.height', .01, height);
    if (x + imageWidth > width + 1e-8 || y + imageHeight > height + 1e-8) invalid('.background', 'must fit inside the surface. Fit or remove the background before applying.');
    result.background = { image: validateImage(background.image), x, y, width: imageWidth, height: imageHeight };
  }
  return result;
}
