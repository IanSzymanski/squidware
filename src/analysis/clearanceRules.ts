export type PerformerFootprint = { shape: 'circle'; diameter: number } | { shape: 'rectangle'; width: number; depth: number };
export interface ClearanceRules { minimumGap: number; performer: PerformerFootprint }

export const CLEARANCE_LIMITS = { minSize: .1, maxSize: 10, maxGap: 5 };
export const DEFAULT_CLEARANCE_RULES: ClearanceRules = { minimumGap: .25, performer: { shape: 'circle', diameter: 1 } };
export const OPENING_CLEARANCE_ID = '@opening-clearance';

export function validateClearanceRules(input: unknown): ClearanceRules | undefined {
  if (input === undefined) return;
  function record(value: unknown, path: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid project: ${path} must be an object.`);
    return value as Record<string, unknown>;
  }
  function number(value: unknown, min: number, max: number, path: string) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`Invalid project: ${path} must be from ${min} to ${max} yards.`);
    }
    return value;
  }
  const data = record(input, 'clearanceRules'), body = record(data.performer, 'clearanceRules.performer');
  const minimumGap = number(data.minimumGap, 0, CLEARANCE_LIMITS.maxGap, 'clearanceRules.minimumGap');
  const size = (key: string) => number(body[key], CLEARANCE_LIMITS.minSize, CLEARANCE_LIMITS.maxSize, `clearanceRules.performer.${key}`);
  if (body.shape === 'circle') return { minimumGap, performer: { shape: 'circle', diameter: size('diameter') } };
  if (body.shape === 'rectangle') return { minimumGap, performer: { shape: 'rectangle', width: size('width'), depth: size('depth') } };
  throw new Error('Invalid project: clearanceRules.performer.shape must be circle or rectangle.');
}
