import { describe, expect, it } from 'vitest';
import { createPerformanceFixture } from '../performanceFixtures';
import { nextFieldFocus } from './fieldKeyboard';

describe('field keyboard focus', () => {
  const positions = { a: { x: 10, y: 10 }, b: { x: 12, y: 10 }, c: { x: 10, y: 12 }, d: { x: 11, y: 11 } };
  const ids = Object.keys(positions);
  it('moves focus in the requested direction with stable nearest-distance ties', () => {
    expect(nextFieldFocus(ids, positions, 'a', 'ArrowRight')).toBe('d');
    expect(nextFieldFocus(ids, positions, 'b', 'ArrowLeft')).toBe('d');
    expect(nextFieldFocus(ids, positions, 'c', 'ArrowUp')).toBe('d');
    expect(nextFieldFocus(ids, positions, 'd', 'ArrowDown')).toBe('c');
    expect(nextFieldFocus(ids, positions, 'a', 'ArrowLeft')).toBe('a');
  });
  it('reaches overlapping performers and roster boundaries without changing geometry', () => {
    const overlap = { ...positions, duplicate: positions.a };
    const roster = [...ids, 'duplicate'];
    expect(nextFieldFocus(roster, overlap, 'd', 'PageDown')).toBe('duplicate');
    expect(nextFieldFocus(roster, overlap, 'duplicate', 'PageDown')).toBe('duplicate');
    expect(nextFieldFocus(roster, overlap, 'duplicate', 'Home')).toBe('a');
    expect(nextFieldFocus(roster, overlap, 'a', 'End')).toBe('duplicate');
    expect(overlap.duplicate).toBe(positions.a);
  });
  it('handles empty casts, removed focus and missing positions', () => {
    expect(nextFieldFocus([], {}, null, 'Home')).toBeNull();
    expect(nextFieldFocus(['missing', ...ids], positions, 'removed', 'ArrowDown')).toBe('a');
    expect(nextFieldFocus(ids, positions, 'a', 'PageUp')).toBe('a');
  });
  it('can inspect every performer in the maximum cast through roster focus alone', () => {
    const project = createPerformanceFixture('maximum');
    const ids = project.performers.map(person => person.id);
    let current = nextFieldFocus(ids, project.sets[0].positions, null, 'Home');
    const visited = [current];
    for (let index = 1; index < ids.length; index++) { current = nextFieldFocus(ids, project.sets[0].positions, current, 'PageDown'); visited.push(current); }
    expect(visited).toEqual(ids);
  });
});
