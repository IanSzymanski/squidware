import { describe, expect, it } from 'vitest';
import v1Text from './fixtures/schema-v1.squid?raw';
import v2Text from './fixtures/schema-v2.squid?raw';
import { analyzeTransition, countToSeconds, createBlankProject, createDemoProject, exportCoordinatesCsv, parseProject,
  PROJECT_LIMITS, sampleProject, secondsToCount, setStartCount, totalCounts } from './domain';
import * as legacy from './fixtures/legacyEngine';
import { validateLegacyProject } from './projectValidation';
import { createLegacyPerformanceFixture } from './performanceFixtures';
import { migrateProjectV1, parseProjectV2, projectV2AsLegacy, serializeProjectV2, validateProjectV2 } from './projectV2';
import type { ProjectV2 } from './projectV2';

const fixture = () => parseProjectV2(v2Text);

describe('schema v2 migration and compatibility', () => {
  it('migrates the pinned v1 fixture into the pinned v2 fixture without mutating either', () => {
    const old = validateLegacyProject(JSON.parse(v1Text));
    const before = JSON.stringify(old);
    expect(migrateProjectV1(old)).toEqual(fixture());
    expect(parseProjectV2('\uFEFF' + v1Text)).toEqual(fixture());
    expect(JSON.stringify(old)).toBe(before);
    expect(migrateProjectV1(old)).toEqual(migrateProjectV1(old));
    expect(projectV2AsLegacy(fixture())).toEqual(old);
    expect(fixture().sets[0]).not.toHaveProperty('counts');
    expect(fixture().sets[0]).not.toHaveProperty('tempo');
    expect(fixture().openingTiming).toEqual({ tempo: 91.25, transition: 'ease' });
  });

  it('preserves samples, time conversions, warning counts and existing CSV columns', () => {
    const old = validateLegacyProject(JSON.parse(v1Text));
    const compatible = parseProject(v1Text);
    expect(totalCounts(compatible)).toBe(40);
    for (const count of [-1, 0, 0.1, 4, 8, 15.999, 16, 16.001, 20, 28, 39.999, 40, 99]) {
      expect(sampleProject(compatible, count)).toEqual(legacy.sampleProject(old, count));
      expect(countToSeconds(compatible, count)).toBe(legacy.countToSeconds(old, count));
      expect(secondsToCount(compatible, legacy.countToSeconds(old, count))).toBe(legacy.secondsToCount(old, legacy.countToSeconds(old, count)));
    }
    for (let index = 0; index < old.sets.length; index += 1) {
      expect(setStartCount(compatible, index)).toBe(legacy.setStartCount(old, index));
      // Rule explanations are new; migration preserves the original flag content and semantics.
      expect(analyzeTransition(compatible, index).map(issue => ({ ...issue, message: issue.message.split(/ (?:Limit|Minimum) /)[0] }))).toEqual(legacy.analyzeTransition(old, index));
    }
    const originalRows = legacy.exportCoordinatesCsv(old).trimEnd().split('\r\n');
    const currentRows = exportCoordinatesCsv(compatible).trimEnd().split('\r\n');
    expect(currentRows).toHaveLength(originalRows.length);
    // Coordinate-output metadata is appended; existing columns keep their order and values.
    originalRows.forEach((row, index) => expect(currentRows[index].startsWith(row + ',')).toBe(true));
  });

  it('round-trips move and segment identities with explicit supported paths', () => {
    const project = fixture();
    project.moves[0].id = 'authored-move';
    project.moves[0].paths.a = { segments: [{ id: 'authored-segment', kind: 'line', startCount: 0, endCount: 16 }] };
    expect(parseProjectV2(serializeProjectV2(project))).toEqual(project);
    const copy = validateProjectV2(project);
    copy.sets[0].positions.a.x = 99;
    copy.moves[0].paths.a.segments[0].id = 'changed';
    expect(project.sets[0].positions.a.x).toBe(10);
    expect(project.moves[0].paths.a.segments[0].id).toBe('authored-segment');
  });

  it('keeps a single opening picture at zero elapsed time without fabricating a move', () => {
    const old = projectV2AsLegacy(createBlankProject());
    old.sets[0].tempo = 20.125;
    old.sets[0].transition = 'ease';
    const project = parseProjectV2(JSON.stringify(old));
    expect(project.moves).toEqual([]);
    expect(project.openingTiming).toEqual({ tempo: 20.125, transition: 'ease' });
    expect(parseProjectV2(serializeProjectV2(project))).toEqual(project);
    expect(sampleProject(project, 1)).toEqual(legacy.sampleProject(old, 1));
    expect(countToSeconds(project, 10)).toBe(0);
  });

  it('preserves the bundled demonstration across every move boundary and midpoint', () => {
    const old = projectV2AsLegacy(createDemoProject());
    const migrated = parseProject(JSON.stringify(old));
    expect(projectV2AsLegacy(migrated)).toEqual(old);
    old.sets.forEach((set, index) => {
      const arrival = legacy.setStartCount(old, index);
      for (const count of [arrival, arrival - set.counts / 2]) {
        expect(sampleProject(migrated, count)).toEqual(legacy.sampleProject(old, count));
        expect(countToSeconds(migrated, count)).toBe(legacy.countToSeconds(old, count));
      }
    });
  });

  it('migrates the deterministic maximum 500-performer, 128-picture fixture within the file budget', () => {
    const old = createLegacyPerformanceFixture('maximum');
    const project = parseProject(JSON.stringify(old));
    expect(project.moves).toHaveLength(127);
    expect(new Set(project.moves.map(move => move.id)).size).toBe(127);
    const content = serializeProjectV2(project);
    expect(new TextEncoder().encode(content).byteLength).toBeLessThan(PROJECT_LIMITS.projectBytes);
    const restored = projectV2AsLegacy(parseProjectV2(content));
    expect(restored).toEqual(old);
    for (const count of [0, 0.1, 16, 32, 32.1, 2032, 4064]) expect(sampleProject(project, count)).toEqual(legacy.sampleProject(old, count));
  });

  it('discards informational unknown properties and canonicalizes path map order', () => {
    const project = fixture();
    const path = (id: string) => ({ segments: [{ id, kind: 'line' as const, startCount: 0, endCount: 16 }] });
    project.moves[0].paths = { b: path('b-line'), a: path('a-line') };
    const input = { ...project, extra: 1, moves: project.moves.map(move => ({ ...move, extra: 1 })) };
    const checked = validateProjectV2(input);
    expect(checked).not.toHaveProperty('extra');
    expect(checked.moves[0]).not.toHaveProperty('extra');
    expect(Object.keys(checked.moves[0].paths)).toEqual(['a', 'b']);
    expect(serializeProjectV2(checked)).toBe(serializeProjectV2(parseProjectV2(JSON.stringify(input))));
  });
});

describe('schema v2 rejects ambiguous or unsupported productions', () => {
  it.each([
    ['missing move', (p: ProjectV2) => { p.moves.pop(); }, /exactly 2 adjacent moves/],
    ['extra move', (p: ProjectV2) => { p.moves.push(p.moves[0]); }, /exactly 2 adjacent moves/],
    ['dangling endpoint', (p: ProjectV2) => { p.moves[0].toSetId = 'missing'; }, /adjacent sets/],
    ['reversed endpoint', (p: ProjectV2) => { p.moves[0].fromSetId = 'crossing'; }, /adjacent sets/],
    ['skipped endpoint', (p: ProjectV2) => { p.moves[0].toSetId = 'arrival'; }, /adjacent sets/],
    ['duplicate move', (p: ProjectV2) => { p.moves[1].id = p.moves[0].id; }, /duplicates move ID/],
    ['reserved move ID', (p: ProjectV2) => { p.moves[0].id = '__proto__'; }, /reserved keys/],
    ['fractional counts', (p: ProjectV2) => { p.moves[0].counts = 16.5; }, /integer/],
    ['zero counts', (p: ProjectV2) => { p.moves[0].counts = 0; }, /integer/],
    ['excess counts', (p: ProjectV2) => { p.moves[0].counts = 1025; }, /1024/],
    ['invalid tempo', (p: ProjectV2) => { p.moves[0].tempo = Infinity; }, /finite number/],
    ['invalid opening tempo', (p: ProjectV2) => { p.openingTiming.tempo = 19; }, /openingTiming.tempo/],
    ['unknown path performer', (p: ProjectV2) => { p.moves[0].paths.missing = { segments: [] }; }, /unknown performer/],
    ['missing position', (p: ProjectV2) => { delete p.sets[0].positions.a; }, /exactly one position/],
    ['invalid coordinates', (p: ProjectV2) => { p.sets[0].positions.a.x = -1; }, /positions.a.x/],
    ['dangling section', (p: ProjectV2) => { p.performers[0].sectionId = 'missing'; }, /unknown section/],
    ['duplicate picture', (p: ProjectV2) => { p.sets[1].id = p.sets[0].id; }, /duplicate ID/],
  ] as const)('rejects %s', (_name, edit, message) => {
    const project = fixture();
    edit(project);
    expect(() => validateProjectV2(project)).toThrow(message);
  });

  it('rejects unsupported segment kinds and partitions rather than erasing motion intent', () => {
    const project = fixture();
    const segment = { id: 'segment', kind: 'line' as const, startCount: 0, endCount: 16 };
    for (const segments of [[], [segment, { ...segment, id: 'second' }], [{ ...segment, startCount: 1 }], [{ ...segment, endCount: 15 }]]) {
      project.moves[0].paths.a = { segments };
      expect(() => serializeProjectV2(project)).toThrow(/segments/);
    }
    const input = { ...project, moves: [{ ...project.moves[0], paths: { a: { segments: [{ ...segment, kind: 'curve' }] } } }, project.moves[1]] };
    expect(() => validateProjectV2(input)).toThrow(/Update Squidware/);
  });

  it('rejects legacy timing on v2 pictures and missing opening timing', () => {
    const project = fixture();
    expect(() => validateProjectV2({ ...project, sets: [{ ...project.sets[0], tempo: 120 }, ...project.sets.slice(1)] })).toThrow(/belongs on the incoming move/);
    expect(() => validateProjectV2({ ...project, openingTiming: undefined })).toThrow(/openingTiming/);
  });

  it('rejects corrupt and future files with actionable version errors', () => {
    expect(() => parseProjectV2('{broken')).toThrow(/not valid JSON/);
    expect(() => parseProjectV2('null')).toThrow(/root/);
    for (const schemaVersion of [0, -1, '2', 2.5, null]) {
      expect(() => parseProjectV2(JSON.stringify({ schemaVersion }))).toThrow(/must be 1, 2, 3, 4 or 5/);
    }
    expect(() => parseProjectV2(JSON.stringify({ schemaVersion: 6 }))).toThrow(/version 6.*Update Squidware/);
    expect(() => parseProjectV2(v1Text.replace('"counts":16', '"counts":0'))).toThrow(/sets\[1\].counts/);
    expect(() => validateProjectV2(validateLegacyProject(JSON.parse(v1Text)))).toThrow(/Use migrateProjectV1/);
  });

  it('measures byte limits before parsing and after serializing multibyte notes', () => {
    expect(() => parseProjectV2(' '.repeat(PROJECT_LIMITS.projectBytes + 1))).toThrow(/10 MiB/);
    expect(() => parseProjectV2('💧'.repeat(PROJECT_LIMITS.projectBytes / 4 + 1))).toThrow(/10 MiB/);
    const project = migrateProjectV1(createLegacyPerformanceFixture('maximum'));
    project.sets.forEach(set => { set.notes = '水'.repeat(PROJECT_LIMITS.text.notes); });
    // Extend valid performer IDs to approach the budget without violating text/geometry limits.
    const rename = new Map(project.performers.map((performer, index) => [performer.id, `p-${index}-${'x'.repeat(119)}`]));
    project.performers.forEach(performer => { performer.id = rename.get(performer.id)!; });
    project.sets.forEach(set => { set.positions = Object.fromEntries(Object.entries(set.positions).map(([id, point]) => [rename.get(id)!, point])); });
    expect(() => serializeProjectV2(project)).toThrow(/10 MiB/);
  });
});
