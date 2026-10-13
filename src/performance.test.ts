import { describe, expect, it } from 'vitest';
import { analyzeTransition, parseProject, PROJECT_LIMITS, serializeProject, validateProject } from './domain';
import { createPerformanceFixture } from './performanceFixtures';

describe('reproducible performance fixtures', () => {
  for (const [name, performers, sets] of [['demo', 64, 6], ['maximum', 500, 128]] as const) {
    it(`${name} is deterministic, valid, UUID-based and fits the file limit`, () => {
      const project = createPerformanceFixture(name);
      expect(project).toEqual(createPerformanceFixture(name));
      expect(validateProject(project)).toEqual(project);
      expect(project.performers).toHaveLength(performers);
      expect(project.sets).toHaveLength(sets);
      const ids = [project.id, ...project.sections.map(item => item.id), ...project.performers.map(item => item.id), ...project.sets.map(item => item.id)];
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
      const serialized = serializeProject(project);
      expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(PROJECT_LIMITS.projectBytes);
      expect(parseProject(serialized)).toEqual(project);
    });
  }
  it('maximum fixture exercises dense collisions and crossing paths', () => {
    const project = createPerformanceFixture('maximum');
    const first = project.performers[0].id;
    const second = project.performers[1].id;
    expect(project.sets[0].positions[first].x).toBeLessThan(project.sets[0].positions[second].x);
    expect(project.sets[1].positions[first].x).toBeGreaterThan(project.sets[1].positions[second].x);
    expect(analyzeTransition(project, 1).filter(issue => issue.type === 'collision').length).toBeGreaterThan(500);
  });
});
