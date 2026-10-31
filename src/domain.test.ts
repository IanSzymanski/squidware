import { describe, expect, it } from 'vitest';
import type { FormationKind, Project } from './types';
import {
  analyzeTransition, clampPoint, coordinateDescription, countToSeconds, createBlankProject, createDemoProject,
  exportCoordinatesCsv, fitFormationToField, generateFormation, importRosterCsv, parseProject, sampleProject, secondsToCount,
  PROJECT_LIMITS, setTiming, serializeProject, setStartCount, totalCounts, transformPositions, validateProject,
} from './domain';

function twoPerformerProject(): Project {
  const project = createBlankProject();
  project.performers = [
    { id: 'a', label: 'A1', name: 'Ada', sectionId: 'brass' },
    { id: 'b', label: 'B1', name: 'Ben', sectionId: 'brass' },
  ];
  project.sets[0].positions = { a: { x: 10, y: 10 }, b: { x: 30, y: 10 } };
  project.sets.push({ id: 'destination', name: 'Arrival', notes: '', positions: { a: { x: 30, y: 10 }, b: { x: 10, y: 10 } } });
  project.moves.push({ id: 'move', fromSetId: project.sets[0].id, toSetId: 'destination', counts: 16, tempo: 120, transition: 'linear', paths: {} });
  return project;
}

describe('project templates and storage', () => {
  it('creates an independent, valid blank project', () => {
    const a = createBlankProject();
    const b = createBlankProject();
    a.sections[0].name = 'Changed';
    a.field.preset = 'high-school';
    expect(b.sections[0].name).toBe('Brass');
    expect(b.field.width).toBe(100);
    expect(b.field.preset).toBe('college');
    expect(a.id).not.toBe(b.id);
    expect(validateProject(a)).toEqual(a);
    expect(totalCounts(a)).toBe(0);
  });

  it('provides a complete 64-member, six-set example with positions inside the field', () => {
    const project = createDemoProject();
    expect(project.performers).toHaveLength(64);
    expect(project.sections.map(section => project.performers.filter(performer => performer.sectionId === section.id).length)).toEqual([24, 24, 8, 8]);
    expect(project.sets.map((_, index) => setTiming(project, index).counts)).toEqual([0, 32, 32, 24, 32, 32]);
    expect(totalCounts(project)).toBe(152);
    expect(validateProject(project)).toEqual(project);
    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it('accepts a UTF-8 BOM and discards unknown properties', () => {
    const project = createBlankProject();
    const input = { ...project, injected: 'removed', field: { ...project.field, unexpected: 'removed' } };
    expect(parseProject('\uFEFF' + JSON.stringify(input))).toEqual(project);
  });

  it('restricts imported fields to supported football dimensions and canonicalizes rounded heights', () => {
    const project = createBlankProject();
    project.field.height = 53.333;
    expect(validateProject(project).field.height).toBe(160 / 3);
    project.field.height = 53.334;
    expect(validateProject(project).field.height).toBe(160 / 3);
    project.field.height = 53.335;
    expect(() => validateProject(project)).toThrow(/field.height/);
    project.field.height = 160 / 3;
    project.field.width = 1;
    expect(() => validateProject(project)).toThrow(/field.width/);
    project.field.width = 101;
    expect(() => validateProject(project)).toThrow(/field.width/);
  });

  it('rejects oversized ensembles and timelines before rendering them', () => {
    const project = twoPerformerProject();
    project.performers = Array.from({ length: PROJECT_LIMITS.performers + 1 }, (_, index) => ({ ...project.performers[0], id: `performer-${index}` }));
    expect(() => validateProject(project)).toThrow(/performers must contain 0 to 500/);
    project.performers = [];
    project.sets = Array.from({ length: PROJECT_LIMITS.sets + 1 }, (_, index) => ({ ...project.sets[0], id: `set-${index}`, positions: {} }));
    project.moves = project.sets.slice(1).map((set, index) => ({ id: 'move-' + index, fromSetId: project.sets[index].id, toSetId: set.id, counts: 32, tempo: 120, transition: 'linear', paths: {} }));
    expect(() => validateProject(project)).toThrow(/sets must contain 1 to 128/);
  });

  it('rebuilds nested positions without retaining input references', () => {
    const input = twoPerformerProject();
    const checked = validateProject(input);
    checked.sets[0].positions.a.x = 40;
    expect(input.sets[0].positions.a.x).toBe(10);
  });

  it.each([
    ['unsupported schema', (p: Project) => ({ ...p, schemaVersion: 7 }), /schema version 7/],
    ['duplicate performer IDs', (p: Project) => ({ ...p, performers: [p.performers[0], p.performers[0]] }), /duplicate ID/],
    ['duplicate set IDs', (p: Project) => ({ ...p, sets: [p.sets[0], { ...p.sets[1], id: p.sets[0].id }] }), /duplicate ID/],
    ['reserved IDs', (p: Project) => ({ ...p, id: '__proto__' }), /reserved key/],
    ['unknown section', (p: Project) => ({ ...p, performers: [{ ...p.performers[0], sectionId: 'missing' }, p.performers[1]] }), /unknown section/],
    ['invalid color', (p: Project) => ({ ...p, sections: [{ ...p.sections[0], color: 'red' }] }), /hex color/],
    ['nonfinite field', (p: Project) => ({ ...p, field: { ...p.field, width: Infinity } }), /field.width/],
    ['negative field', (p: Project) => ({ ...p, field: { ...p.field, height: -1 } }), /field.height/],
    ['empty timeline', (p: Project) => ({ ...p, sets: [] }), /sets must contain/],
  ])('rejects %s with a useful error', (_, change, error) => {
    expect(() => validateProject(change(twoPerformerProject()))).toThrow(error);
  });

  it('rejects absent, extraneous, and out-of-bounds positions', () => {
    const project = twoPerformerProject();
    delete project.sets[1].positions.a;
    expect(() => validateProject(project)).toThrow(/exactly one position/);
    project.sets[1].positions.unknown = { x: 10, y: 10 };
    expect(() => validateProject(project)).toThrow(/unknown performer/);
    delete project.sets[1].positions.unknown;
    project.sets[1].positions.a = { x: -1, y: 10 };
    expect(() => validateProject(project)).toThrow(/positions.a.x/);
    project.sets[1].positions.a = { x: 10, y: NaN };
    expect(() => validateProject(project)).toThrow(/positions.a.y/);
  });

  it('enforces zero opening counts, positive subsequent counts, and nonzero tempo', () => {
    const project = twoPerformerProject();
    const invalidOpening = { ...project, sets: [{ ...project.sets[0], counts: 8 }, project.sets[1]] };
    expect(() => validateProject(invalidOpening)).toThrow(/sets\[0\].counts/);
    project.moves[0].counts = 0;
    expect(() => validateProject(project)).toThrow(/moves\[0\].counts/);
    project.moves[0].counts = 16.5;
    expect(() => validateProject(project)).toThrow(/integer/);
    project.moves[0].counts = 16;
    project.moves[0].tempo = 0;
    expect(() => validateProject(project)).toThrow(/tempo/);
  });

  it('rejects malformed JSON and oversized files', () => {
    expect(() => parseProject('{ broken')).toThrow(/not valid JSON/);
    expect(() => parseProject(' '.repeat(PROJECT_LIMITS.projectBytes + 1))).toThrow(/too large/);
    expect(() => validateProject(null)).toThrow(/root must be an object/);
    expect(() => validateProject([])).toThrow(/root must be an object/);
  });

  it('measures the 10 MiB project limit in UTF-8 bytes including multibyte characters', () => {
    const project = createBlankProject();
    project.title = '潮汐 🐙';
    const content = serializeProject(project);
    const exactLimit = content + ' '.repeat(PROJECT_LIMITS.projectBytes - new TextEncoder().encode(content).byteLength);
    expect(parseProject(exactLimit)).toEqual(project);
    expect(() => parseProject(exactLimit + ' ')).toThrow(/10 MiB/);
    // This is under the character limit but above the byte limit.
    expect(() => parseProject('🐙'.repeat(Math.floor(PROJECT_LIMITS.projectBytes / 4) + 1))).toThrow(/too large/);
  });

  it('round-trips a maximum-size ensemble and timeline in compact format', () => {
    const project = createBlankProject();
    project.performers = Array.from({ length: PROJECT_LIMITS.performers }, (_, index) => ({ id: `p-${index}`, label: `P${index}`, name: 'Performer', sectionId: 'brass' }));
    const positions = Object.fromEntries(project.performers.map((performer, index) => [performer.id, { x: index % 100, y: Math.floor(index / 100) * 10 }]));
    project.sets = Array.from({ length: PROJECT_LIMITS.sets }, (_, index) => ({ ...project.sets[0], id: `set-${index}`, positions }));
    project.moves = project.sets.slice(1).map((set, index) => ({ id: 'move-' + index, fromSetId: project.sets[index].id, toSetId: set.id, counts: 32, tempo: 120, transition: 'linear', paths: {} }));
    const content = serializeProject(project);
    expect(content.split('\n')).toHaveLength(2);
    expect(new TextEncoder().encode(content).byteLength).toBeLessThan(PROJECT_LIMITS.projectBytes);
    expect(parseProject(content)).toEqual(project);
  });

  it('rejects a serialized project over the byte budget even when entity counts are allowed', () => {
    const project = createBlankProject();
    project.performers = Array.from({ length: PROJECT_LIMITS.performers }, (_, index) => ({ id: `performer-${String(index).padStart(118, '0')}`, label: `P${index}`, name: '', sectionId: 'brass' }));
    const positions = Object.fromEntries(project.performers.map(performer => [performer.id, { x: 49.99999999999999, y: 26.666666666666668 }]));
    project.sets = Array.from({ length: PROJECT_LIMITS.sets }, (_, index) => ({ ...project.sets[0], id: `set-${index}`, notes: 'x'.repeat(10_000), positions }));
    project.moves = project.sets.slice(1).map((set, index) => ({ id: 'move-' + index, fromSetId: project.sets[index].id, toSetId: set.id, counts: 32, tempo: 120, transition: 'linear', paths: {} }));
    expect(() => serializeProject(project)).toThrow(/too large/);
  });
});

describe('count timeline and tempo map', () => {
  it('interpolates destination sets and gives stable exact arrival boundaries', () => {
    const project = twoPerformerProject();
    expect(sampleProject(project, 0)).toMatchObject({ setIndex: 0, progress: 0, localCount: 0 });
    expect(sampleProject(project, 4)).toMatchObject({ setIndex: 1, progress: 0.25, localCount: 4, positions: { a: { x: 15, y: 10 }, b: { x: 25, y: 10 } } });
    expect(sampleProject(project, 16)).toMatchObject({ setIndex: 1, progress: 1, positions: project.sets[1].positions });
    expect(sampleProject(project, 100).positions).toEqual(project.sets[1].positions);
    expect(sampleProject(project, -1).positions).toEqual(project.sets[0].positions);
    expect(setStartCount(project, 0)).toBe(0);
    expect(setStartCount(project, 1)).toBe(16);
  });

  it('uses smoothstep for eased position while preserving count progress', () => {
    const project = twoPerformerProject();
    project.moves[0].transition = 'ease';
    const sample = sampleProject(project, 4);
    expect(sample.progress).toBe(0.25);
    expect(sample.positions.a.x).toBeCloseTo(13.125);
    expect(sampleProject(project, 8).positions.a.x).toBe(20);
  });

  it('converts across changing destination tempos and round-trips fractional counts', () => {
    const project = twoPerformerProject();
    project.openingTiming.tempo = 60; // The opening picture has no elapsed duration.
    project.sets.push({ ...project.sets[1], id: 'third' });
    project.moves.push({ ...project.moves[0], id: 'second-move', fromSetId: 'destination', toSetId: 'third', counts: 8, tempo: 60 });
    expect(countToSeconds(project, 16)).toBe(8);
    expect(countToSeconds(project, 20)).toBe(12);
    expect(countToSeconds(project, 24)).toBe(16);
    expect(secondsToCount(project, 12)).toBe(20);
    for (let count = 0; count <= 24; count += 0.125) {
      expect(secondsToCount(project, countToSeconds(project, count))).toBeCloseTo(count, 9);
    }
    expect(secondsToCount(project, 1e6)).toBe(24);
    expect(secondsToCount(project, -10)).toBe(0);
    expect(countToSeconds(project, 1e6)).toBe(16);
  });

  it('does not incorporate media offset into drill count time', () => {
    const project = twoPerformerProject();
    project.audioOffsetSeconds = -4;
    expect(countToSeconds(project, 16)).toBe(8);
    expect(secondsToCount(project, 8)).toBe(16);
  });
});

describe('formation geometry', () => {
  const options = { center: { x: 50, y: 25 }, width: 40, height: 20, rotation: 0, columns: 4 };

  it('keeps a fitting formation unchanged and returns independent position objects', () => {
    const points = [{ x: 1.25, y: 0.625 }, { x: 61.875, y: 32.5 }, { x: 100, y: 160 / 3 }];
    const result = fitFormationToField(points, createBlankProject().field);
    expect(result).toEqual(points);
    expect(result).not.toBe(points);
    expect(result[0]).not.toBe(points[0]);
    expect(fitFormationToField([], createBlankProject().field)).toEqual([]);
  });

  it('translates a near-sideline arc together by only the required distance', () => {
    const field = createBlankProject().field;
    const points = generateFormation('arc', 24, { ...options, center: { x: 50, y: 50 }, width: 45, height: 22 });
    const result = fitFormationToField(points, field);
    const requiredDy = field.height - Math.max(...points.map(point => point.y));
    expect(requiredDy).toBeLessThan(0);
    result.forEach((point, index) => {
      expect(point.x).toBe(points[index].x);
      expect(point.y - points[index].y).toBeCloseTo(requiredDy, 10);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(field.height);
      if (index > 0) expect(Math.hypot(point.x - result[index - 1].x, point.y - result[index - 1].y)).toBeCloseTo(Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y), 10);
    });
    expect(Math.max(...result.map(point => point.y))).toBeCloseTo(field.height, 10);
    expect(new Set(result.map(point => `${point.x.toFixed(9)},${point.y.toFixed(9)}`)).size).toBe(points.length);
  });

  it('uniformly shrinks a rotated 95-yard line to field depth without stacking its endpoints', () => {
    const field = createBlankProject().field;
    const points = generateFormation('line', 32, { ...options, center: { x: 50, y: field.height / 2 }, width: 95, rotation: 90 });
    const result = fitFormationToField(points, field);
    expect(result[0].y).toBeCloseTo(0, 10);
    expect(result.at(-1)!.y).toBeCloseTo(field.height, 10);
    result.forEach((point, index) => {
      expect(point.x).toBeCloseTo(50, 10);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(field.height);
      if (index > 0) expect(point.y - result[index - 1].y).toBeCloseTo(field.height / (points.length - 1), 10);
    });
    expect(new Set(result.map(point => point.y.toFixed(9))).size).toBe(points.length);
  });

  it('preserves two-dimensional ratios when an oversized rotated shape is fitted', () => {
    const field = createBlankProject().field;
    const points = generateFormation('block', 12, { ...options, width: 150, height: 80, rotation: 37 });
    const result = fitFormationToField(points, field);
    const ratio = Math.hypot(result[1].x - result[0].x, result[1].y - result[0].y) / Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
    result.forEach((point, index) => {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(field.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(field.height);
      expect(Math.hypot(point.x - result[0].x, point.y - result[0].y)).toBeCloseTo(Math.hypot(points[index].x - points[0].x, points[index].y - points[0].y) * ratio, 9);
    });
  });
  it.each<FormationKind>(['line', 'arc', 'circle', 'block', 'curve'])('creates bounded finite %s geometry with exact cast length', kind => {
    const points = generateFormation(kind, 17, options);
    expect(points).toHaveLength(17);
    points.forEach(point => {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(point.x).toBeGreaterThanOrEqual(30 - 1e-8);
      expect(point.x).toBeLessThanOrEqual(70 + 1e-8);
      expect(point.y).toBeGreaterThanOrEqual(15 - 1e-8);
      expect(point.y).toBeLessThanOrEqual(35 + 1e-8);
    });
    expect(generateFormation(kind, 1, options)).toEqual([options.center]);
    expect(generateFormation(kind, 0, options)).toEqual([]);
  });

  it('places line endpoints, rotates about the center, and avoids a repeated circle endpoint', () => {
    expect(generateFormation('line', 3, options)).toEqual([{ x: 30, y: 25 }, { x: 50, y: 25 }, { x: 70, y: 25 }]);
    const rotated = generateFormation('line', 3, { ...options, rotation: 90 });
    expect(rotated[0].x).toBeCloseTo(50);
    expect(rotated[0].y).toBeCloseTo(5);
    const circle = generateFormation('circle', 16, options);
    expect(new Set(circle.map(point => `${point.x},${point.y}`)).size).toBe(16);
  });

  it('rejects invalid counts and dimensions', () => {
    expect(() => generateFormation('block', -1, options)).toThrow(/Formation size/);
    expect(() => generateFormation('block', PROJECT_LIMITS.performers + 1, options)).toThrow(/Formation size/);
    expect(() => generateFormation('block', 2.5, options)).toThrow(/Formation size/);
    expect(() => generateFormation('block', 2, { ...options, width: NaN })).toThrow(/finite numbers/);
    expect(() => generateFormation('block', 2, { ...options, height: -1 })).toThrow(/cannot be negative/);
  });

  it('transforms only selected members about their centroid and clamps to the field', () => {
    const field = createBlankProject().field;
    const positions = { a: { x: 10, y: 10 }, b: { x: 20, y: 10 }, c: { x: 40, y: 40 } };
    const result = transformPositions(positions, ['a', 'b', 'a', 'missing'], { rotation: 90, scale: 2 }, field);
    expect(result.a.x).toBeCloseTo(15);
    expect(result.a.y).toBeCloseTo(0);
    expect(result.b.x).toBeCloseTo(15);
    expect(result.b.y).toBeCloseTo(20);
    expect(result.c).toEqual(positions.c);
    expect(result.c).not.toBe(positions.c);
    expect(positions.a).toEqual({ x: 10, y: 10 });
    expect(transformPositions(positions, ['a'], { dx: -100, dy: 100 }, field).a).toEqual({ x: 0, y: field.height });
    expect(clampPoint({ x: 120, y: -2 }, field)).toEqual({ x: 100, y: 0 });
  });

  it('stops a translated selection together at each boundary while preserving spacing', () => {
    const field = createBlankProject().field;
    const positions = { a: { x: 1, y: 2 }, b: { x: 11, y: 12 }, c: { x: 50, y: 25 } };
    const upperLeft = transformPositions(positions, ['a', 'b', 'a'], { dx: -5, dy: -5 }, field);
    expect(upperLeft.a).toEqual({ x: 0, y: 0 });
    expect(upperLeft.b).toEqual({ x: 10, y: 10 });
    expect(upperLeft.c).toEqual(positions.c);
    const lowerRight = transformPositions(positions, ['a', 'b'], { dx: 200, dy: 200 }, field);
    expect(lowerRight.a).toEqual({ x: 90, y: field.height - 10 });
    expect(lowerRight.b).toEqual({ x: 100, y: field.height });
    expect(Math.hypot(lowerRight.a.x - lowerRight.b.x, lowerRight.a.y - lowerRight.b.y)).toBeCloseTo(Math.sqrt(200));
    expect(positions.a).toEqual({ x: 1, y: 2 });
  });

  it('fits rotation and scaling as a complete shape while leaving unselected members untouched', () => {
    const field = createBlankProject().field;
    const positions = { a: { x: 10, y: 25 }, b: { x: 50, y: 25 }, c: { x: 90, y: 25 }, other: { x: 15, y: 15 } };
    const rotated = transformPositions(positions, ['a', 'b', 'c'], { rotation: 90, scale: 2 }, field);
    expect(rotated.a.y).toBeCloseTo(0, 10);
    expect(rotated.b.y).toBeCloseTo(field.height / 2, 10);
    expect(rotated.c.y).toBeCloseTo(field.height, 10);
    expect(rotated.a.x).toBeCloseTo(50, 10);
    expect(rotated.b.x).toBeCloseTo(50, 10);
    expect(rotated.c.x).toBeCloseTo(50, 10);
    expect(rotated.other).toEqual(positions.other);
    expect(positions.a).toEqual({ x: 10, y: 25 });
  });
});

describe('continuous transition analysis', () => {
  it('detects a crossing between samples even when both endpoints are clear', () => {
    const project = twoPerformerProject();
    project.sets[1].positions.a.x = 50;
    const collisions = analyzeTransition(project, 1).filter(issue => issue.type === 'collision');
    expect(collisions).toHaveLength(1);
    expect(collisions[0].severity).toBe('danger');
    expect(collisions[0].atCount).toBeCloseTo(16 / 3);
    expect(collisions[0].performerIds).toEqual(['a', 'b']);
  });

  it('maps eased crossing positions back to the correct count', () => {
    const project = twoPerformerProject();
    project.sets[1].positions.a.x = 50;
    project.moves[0].transition = 'ease';
    const collision = analyzeTransition(project, 1).find(issue => issue.type === 'collision')!;
    const sample = sampleProject(project, collision.atCount!);
    expect(sample.positions.a.x).toBeCloseTo(sample.positions.b.x, 7);
    expect(collision.atCount).toBeGreaterThan(16 / 3);
  });

  it('does not report a geometric crossing reached at different times', () => {
    const project = twoPerformerProject();
    project.sets[0].positions = { a: { x: 10, y: 10 }, b: { x: 20, y: 0 } };
    project.sets[1].positions = { a: { x: 50, y: 10 }, b: { x: 20, y: 20 } };
    expect(analyzeTransition(project, 1).filter(issue => issue.type === 'collision')).toEqual([]);
  });

  it('detects a stationary near overlap and ignores safe parallel motion', () => {
    const project = twoPerformerProject();
    project.sets[0].positions = { a: { x: 10, y: 10 }, b: { x: 10.75, y: 10 } };
    project.sets[1].positions = { a: { x: 20, y: 10 }, b: { x: 20.75, y: 10 } };
    expect(analyzeTransition(project, 1).find(issue => issue.type === 'collision')?.severity).toBe('warning');
    project.sets[0].positions.b.y = 12;
    project.sets[1].positions.b.y = 12;
    expect(analyzeTransition(project, 1)).toEqual([]);
    expect(analyzeTransition(project, 0)).toEqual([]);
  });

  it('flags a large step size, including peak speed under easing', () => {
    const project = twoPerformerProject();
    expect(analyzeTransition(project, 1).filter(issue => issue.type === 'stride')).toEqual([]);
    project.moves[0].transition = 'ease';
    expect(analyzeTransition(project, 1).filter(issue => issue.type === 'stride')).toHaveLength(2);
    project.moves[0].transition = 'linear';
    project.moves[0].counts = 8;
    expect(analyzeTransition(project, 1).filter(issue => issue.type === 'stride').every(issue => issue.severity === 'danger')).toBe(true);
  });
});

describe('roster CSV and coordinate exports', () => {
  const sections = createBlankProject().sections;

  it('imports BOM, CRLF, quoted commas, escaped quotes, and quoted multiline cells', () => {
    const result = importRosterCsv('\uFEFFlabel,name,section\r\nB1,"Doe, Jane",Brass\r\nW1,"Sam ""Jet""\nLee",woodwinds\r\n', sections);
    expect(result.map(({ label, name, sectionId }) => ({ label, name, sectionId }))).toEqual([
      { label: 'B1', name: 'Doe, Jane', sectionId: 'brass' },
      { label: 'W1', name: 'Sam "Jet"\nLee', sectionId: 'woodwinds' },
    ]);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('supports label-only rosters and section IDs', () => {
    expect(importRosterCsv('label\nA1\nA2', sections).map(performer => performer.sectionId)).toEqual(['brass', 'brass']);
    expect(importRosterCsv('label,name,sectionId\nG1,,guard', sections)[0].sectionId).toBe('guard');
  });

  it('rejects rosters beyond the shared performer limit', () => {
    const content = 'label\n' + Array.from({ length: PROJECT_LIMITS.performers + 1 }, (_, index) => `P${index}`).join('\n');
    expect(() => importRosterCsv(content, sections)).toThrow(/at most 500/);
  });

  it.each([
    ['label,name\nA1,"unfinished', /unterminated/],
    ['label,name\nA1,"Ada"extra', /unexpected text/],
    ['label,name\nA1,Ad"a', /quote must begin/],
    ['label,name\nA1,Ada,Extra', /expected 2 columns/],
    ['label,name\nA1,Ada\na1,Ben', /duplicate label/],
    ['label,name,section\nA1,Ada,Unknown', /unknown section/],
    ['label,label\nA1,Ada', /duplicate column/],
    ['name\nAda', /label column/],
    ['label,name\n,Ada', /label must/],
  ])('rejects malformed roster %s', (csv, error) => {
    expect(() => importRosterCsv(csv, sections)).toThrow(error);
  });

  it('quotes all export cells and neutralizes formula-like user strings', () => {
    const project = twoPerformerProject();
    project.performers[0].name = '=HYPERLINK("https://example.com")';
    project.performers[1].label = ' \t@SUM(1,1)';
    project.sets[1].notes = 'hello,\n"world"';
    const csv = exportCoordinatesCsv(project);
    expect(csv.startsWith('\uFEFF"Set"')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"\' \t@SUM(1,1)"');
    expect(csv).toContain('"hello,\n""world"""');
    expect(csv).toContain('"Arrival","16","16","120"');
  });

  it('describes coordinates from audience left and at eight-to-five step size', () => {
    const field = createBlankProject().field;
    expect(coordinateDescription({ x: 41.25, y: 21.25 }, field)).toBe('Side 1: 2 steps inside the 40-yard line; 2 steps in front of back hash');
    expect(coordinateDescription({ x: 58.75, y: field.height }, field)).toBe('Side 2: 2 steps inside the 40-yard line; on front sideline');
    expect(coordinateDescription({ x: 50, y: 160 / 9 }, { ...field, preset: 'high-school' })).toBe('On the 50-yard line; on back hash');
  });
});
