import type { PerformerAppearance } from './types';

export const instrumentCatalog = {
  trumpet: 'Trumpet',
  mellophone: 'Mellophone',
  trombone: 'Trombone',
  euphonium: 'Baritone / euphonium',
  tuba: 'Tuba / sousaphone',
  flute: 'Flute',
  clarinet: 'Clarinet',
  saxophone: 'Saxophone',
  snare: 'Snare',
  tenors: 'Tenors',
  'bass-drum': 'Bass drum',
};

export const guardCatalog = {
  flag: 'Flag',
  'guard-rifle': 'Practice rifle',
  'guard-saber': 'Guard saber',
};

export type CarriedEquipment = keyof typeof instrumentCatalog | keyof typeof guardCatalog;

const aliases = new Map<string, CarriedEquipment>([
  ['soprano', 'trumpet'], ['baritone', 'euphonium'], ['sousaphone', 'tuba'],
  ['piccolo', 'flute'], ['sax', 'saxophone'], ['tenor', 'tenors'], ['quads', 'tenors'],
  ['bass', 'bass-drum'], ['rifle', 'guard-rifle'], ['saber', 'guard-saber'], ['sabre', 'guard-saber'],
]);

export const DEFAULT_FLAG_COLOR = '#d876a3';

export function equipmentKey(value?: string): CarriedEquipment | undefined {
  if (!value) return;
  if (Object.hasOwn(instrumentCatalog, value) || Object.hasOwn(guardCatalog, value)) return value as CarriedEquipment;
  return aliases.get(value);
}

export function equipmentRole(key: CarriedEquipment): NonNullable<PerformerAppearance['role']> {
  return Object.hasOwn(guardCatalog, key) ? 'guard' : 'instrument';
}

export function resolveEquipment(appearance?: PerformerAppearance, sectionEquipment?: string) {
  const value = appearance?.equipment ?? sectionEquipment;
  const role = appearance?.role;
  const key = equipmentKey(value);
  if (appearance?.equipment === undefined && role && key && equipmentRole(key) !== role) return { role };
  if (key) return { key, role: equipmentRole(key) };
  return { role: role ?? (value && value !== 'none' ? 'instrument' as const : undefined) };
}

export function validateEquipment(value: unknown, path: string): string | undefined {
  if (value === undefined) return;
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(value)) {
    throw new Error(`Invalid project: ${path} must be a lowercase equipment identifier of up to 40 characters.`);
  }
  return equipmentKey(value) ?? value;
}
