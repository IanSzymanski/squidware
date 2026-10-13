import type { Point, Project } from './types';

export type PerformanceFixtureName = 'demo' | 'maximum';

// Stable RFC 4122 v4-shaped UUIDs keep key/string costs representative. They are
// fixture identifiers, not cryptographic random identifiers for real projects.
function fixtureId(value: number): string {
  return `72bcf837-68b4-4000-8000-${value.toString(16).padStart(12, '0')}`;
}
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** No time, random state, network or storage dependency; safe to regenerate. */
export function createPerformanceFixture(name: PerformanceFixtureName): Project {
  if (name !== 'demo' && name !== 'maximum') throw new Error('Unknown performance fixture.');
  const maximum = name === 'maximum';
  const count = maximum ? 500 : 64;
  const setCount = maximum ? 128 : 6;
  const sections = ['Brass', 'Woodwinds', 'Percussion', 'Guard'].map((name, index) => ({
    id: fixtureId(10 + index), name, color: ['#c3e889', '#b9a1e5', '#85c9dd', '#e3a08b'][index],
  }));
  const performers = Array.from({ length: count }, (_, index) => ({
    id: fixtureId(100 + index), label: `P${index + 1}`, name: `Fixture performer ${index + 1}`,
    sectionId: sections[index % sections.length].id,
  }));
  const position = (performer: number, set: number): Point => {
    if (maximum) {
      // 25 x 20 dense lattice. Alternate adjacent columns to force crossing
      // trajectories, and move the entire lattice through a bounded cycle.
      const column = performer % 25;
      const swapped = set % 2 && column < 24 ? column + (column % 2 ? -1 : 1) : column;
      return { x: rounded(40 + swapped * 0.625 + set % 8 * 0.125), y: rounded(20 + Math.floor(performer / 25) * 0.625 + set % 5 * 0.125) };
    }
    const row = Math.floor(performer / 8);
    const column = performer % 8;
    const angle = performer / count * Math.PI * 2;
    if (set % 3 === 0) return { x: 22 + column * 8, y: 12 + row * 4 };
    if (set % 3 === 1) return { x: rounded(50 + Math.cos(angle) * (30 - row * 1.5)), y: rounded(80 / 3 + Math.sin(angle) * (20 - row)) };
    return { x: rounded(18 + performer % 16 * 4.25), y: rounded(14 + Math.floor(performer / 16) * 6 + Math.sin(performer % 16 / 15 * Math.PI * 2) * 5) };
  };
  return {
    schemaVersion: 1, id: fixtureId(maximum ? 2 : 1),
    title: maximum ? 'Performance maximum 500 x 128' : 'Performance demo 64 x 6',
    ensemble: 'Deterministic benchmark ensemble',
    field: { width: 100, height: 160 / 3, preset: 'college' }, sections, performers,
    sets: Array.from({ length: setCount }, (_, index) => ({
      id: fixtureId(1000 + index), name: `Fixture set ${String(index + 1).padStart(3, '0')}`,
      counts: index === 0 ? 0 : 32, tempo: 132 + index % 4 * 4,
      notes: 'Deterministic performance fixture; unsuitable for rehearsal.',
      transition: index % 2 ? 'ease' : 'linear',
      positions: Object.fromEntries(performers.map((performer, performerIndex) => [performer.id, position(performerIndex, index)])),
    })), audioOffsetSeconds: 0,
  };
}
