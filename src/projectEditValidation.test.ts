import { describe, expect, it } from 'vitest';
import { createDemoProject, PROJECT_LIMITS, validateProject, validateProjectEdit } from './domain';
import type { Project } from './types';

describe('validation of structurally shared editor edits', () => {
  it('validates a changed late set and retains existing set references', () => {
    const previous = createDemoProject();
    const performerId = previous.performers[0].id;
    const next = { ...previous, sets: previous.sets.map((set, index) => index === 5 ? { ...set, positions: { ...set.positions, [performerId]: { x: 99, y: 1 } } } : set) };
    expect(() => validateProjectEdit(previous, next)).not.toThrow();
    expect(validateProject(next)).toEqual(next);
    expect(next.sets[3]).toBe(previous.sets[3]);
  });
  it.each([
    ['late count', (p: Project) => ({ ...p, sets: p.sets.map((s, i) => i === 5 ? { ...s, counts: 0 } : s) })],
    ['late coordinate', (p: Project) => ({ ...p, sets: p.sets.map((s, i) => i === 5 ? { ...s, positions: { ...s.positions, [p.performers[0].id]: { x: -1, y: 1 } } } : s) })],
    ['duplicate set ID', (p: Project) => ({ ...p, sets: p.sets.map((s, i) => i === 5 ? { ...s, id: p.sets[2].id } : s) })],
    ['section reference', (p: Project) => ({ ...p, sections: p.sections.slice(1) })],
    ['performer identity', (p: Project) => ({ ...p, performers: p.performers.map((s, i) => i === 0 ? { ...s, id: 'new-identity' } : s) })],
    ['performer name', (p: Project) => ({ ...p, performers: p.performers.map((s, i) => i === 0 ? { ...s, name: 'x'.repeat(PROJECT_LIMITS.text.performerName + 1) } : s) })],
    ['set limit', (p: Project) => ({ ...p, sets: Array.from({ length: PROJECT_LIMITS.sets + 1 }, (_, i) => ({ ...p.sets[i % p.sets.length], id: `set-${i}`, counts: i ? 32 : 0 })) })],
    ['opening count', (p: Project) => ({ ...p, sets: p.sets.map((s, i) => i === 0 ? { ...s, counts: 1 } : s) })],
    ['field size', (p: Project) => ({ ...p, field: { ...p.field, width: 99 } })],
    ['metadata', (p: Project) => ({ ...p, audioOffsetSeconds: Infinity })],
  ] as const)('rejects invalid %s just like full file validation', (_label, edit) => {
    const previous = createDemoProject();
    const next = edit(previous);
    expect(() => validateProject(next)).toThrow();
    expect(() => validateProjectEdit(previous, next)).toThrow();
  });
  it('allows valid insertion, deletion and reorder while enforcing opening timing', () => {
    const previous = createDemoProject();
    for (const sets of [
      [...previous.sets, { ...previous.sets[5], id: 'new-set' }],
      previous.sets.slice(0, 3),
      [previous.sets[0], previous.sets[2], previous.sets[1], ...previous.sets.slice(3)],
    ]) {
      const next = { ...previous, sets };
      expect(() => validateProjectEdit(previous, next)).not.toThrow();
      expect(validateProject(next)).toEqual(next);
    }
  });
});
