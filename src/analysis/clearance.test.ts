import { describe, expect, it } from 'vitest';
import { analyzeTransition, createBlankProject, sampleProject } from '../domain';
import { PROJECT_LIMITS } from '../projectValidation';
import { STAGING_LIMITS, type StagingPose } from '../staging';
import type { Project } from '../types';
import { clearanceFindings, footprintGap, type Footprint } from './clearance';
import { DEFAULT_CLEARANCE_RULES, OPENING_CLEARANCE_ID } from './clearanceRules';
import { TransitionAnalyzer } from './engine';
import { transitionInput } from './input';

const noWait = async () => {};
const pose = (x: number, y: number, changes: Partial<StagingPose> = {}): StagingPose =>
  ({ x, y, width: 2, depth: 2, height: 1, angle: 0, visible: true, ...changes });
const box: Footprint = { shape: 'rectangle', width: 2, depth: 2, angle: 0 };
const circle: Footprint = { shape: 'circle', width: 1, depth: 1, angle: 0 };

function fixture(): Project {
  const project = createBlankProject();
  project.clearanceRules = structuredClone(DEFAULT_CLEARANCE_RULES);
  project.performers = [{ id: 'a', label: 'A1', name: '', sectionId: project.sections[0].id }];
  project.stagingObjects = [{ id: 'deck', name: 'Deck' }];
  project.sets = [
    { id: 's0', name: 'Opening', notes: '', positions: { a: { x: 10, y: 10 } }, staging: { deck: pose(20, 25) } },
    { id: 's1', name: 'Arrival', notes: '', positions: { a: { x: 30, y: 10 } }, staging: { deck: pose(20, 25) } },
  ];
  project.moves = [{ id: 'm', fromSetId: 's0', toSetId: 's1', counts: 8, tempo: 120, transition: 'ease',
    paths: { a: { segments: [{ id: 'arc', kind: 'cubic', startCount: 0, endCount: 8,
      control1: { x: 10, y: 30 }, control2: { x: 30, y: 30 } }] } } }];
  return project;
}

async function checked(project: Project, engine = new TransitionAnalyzer(), index = 1) {
  const result = (await engine.analyze(transitionInput(project, index, 0)!, undefined, noWait))!;
  expect(result.issues).toEqual(analyzeTransition(project, index));
  return result.issues.filter(issue => issue.type === 'clearance');
}

describe('physical footprint clearance', () => {
  it('matches analytic signed edge gaps at faces, corners and a rotated rectangle', () => {
    expect(footprintGap(circle, box, { x: 1.75, y: 0 })).toBeCloseTo(.25);
    expect(footprintGap(circle, box, { x: 1.5, y: 1.5 })).toBeCloseTo(Math.SQRT1_2 - .5);
    expect(footprintGap(box, box, { x: 2.3, y: 2.4 })).toBeCloseTo(.5);
    expect(footprintGap(box, box, { x: 1.75, y: 0 })).toBeCloseTo(-.25);
    expect(footprintGap(box, { ...box, angle: 45 }, { x: 1 + Math.SQRT2, y: 0 })).toBeCloseTo(0);
    expect(footprintGap({ ...circle, depth: 2 }, circle, { x: 1.75, y: 0 })).toBeCloseTo(.25);
  });

  it('finds an off-chord crossing in an eased move and respects visibility and opt-in rules', async () => {
    const project = fixture(), engine = new TransitionAnalyzer();
    const [issue] = await checked(project, engine);
    expect(issue).toMatchObject({ severity: 'danger', certainty: 'confirmed', propIds: ['deck'], performerIds: ['a'], atCount: 4 });
    expect(issue.message).toContain('Footprints overlap by 1.5 yd');
    expect(sampleProject(project, issue.atCount!).positions.a).toEqual({ x: 20, y: 25 });

    project.sets[0].staging!.deck = pose(20, 25, { visible: false });
    expect(await checked(project, engine)).toHaveLength(0);
    project.sets[1].staging!.deck = pose(30, 10);
    expect((await checked(project, engine))[0]).toMatchObject({ severity: 'danger', atCount: 8 });
    delete project.clearanceRules;
    expect(await checked(project, engine)).toHaveLength(0);
  });

  it('detects rotating props in a delayed travel window and distinguishes a near miss from overlap', async () => {
    const project = fixture();
    project.moves[0].paths = {};
    project.stagingObjects!.push({ id: 'speaker', name: 'Speaker', footprint: 'circle' });
    project.sets[0].staging!.deck = pose(55, 30, { width: .5, depth: 8 });
    project.sets[1].staging!.deck = pose(55, 30, { width: .5, depth: 8, angle: 90, travel: { start: .25, end: .5 } });
    for (const [offset, severity] of [[2.75, 'danger'], [3.1, 'warning']] as const) {
      for (const set of project.sets) set.staging!.speaker = pose(55 + offset, 30 + offset, { width: .5, depth: .5 });
      const [issue] = await checked(project);
      expect(issue).toMatchObject({ severity, certainty: 'confirmed', propIds: ['deck', 'speaker'], performerIds: [] });
      expect(issue.atCount).toBeGreaterThan(2);
      expect(issue.atCount).toBeLessThan(4);
      const panel = sampleProject(project, issue.atCount!).staging![0];
      expect(panel.angle).toBeGreaterThan(30);
      expect(panel.angle).toBeLessThan(60);
    }
  });

  it('checks translating and resizing props at their own timing inside an eased performer move', async () => {
    const project = fixture();
    project.moves[0].paths = {};
    for (const set of project.sets) set.positions.a = { x: 20, y: 20 };
    project.sets[0].staging!.deck = pose(12, 20, { width: 1, depth: 2 });
    project.sets[1].staging!.deck = pose(28, 20, { width: 3, depth: 2, travel: { start: .5, end: .75 } });
    const [issue] = await checked(project);
    expect(issue).toMatchObject({ atCount: 5, severity: 'danger', certainty: 'confirmed' });
    expect(sampleProject(project, 5).staging![0]).toMatchObject({ x: 20, width: 2 });
  });

  it('uses performer facing and checks static overlaps on a one-set project', async () => {
    const project = fixture();
    project.clearanceRules = { minimumGap: 0, performer: { shape: 'rectangle', width: .5, depth: 8 } };
    project.moves[0].paths = {};
    for (const [index, set] of project.sets.entries()) {
      set.positions.a = { x: 40, y: 20 };
      set.facings = { a: index * 90 };
      set.staging!.deck = pose(42.6, 22.6, { width: .5, depth: .5 });
    }
    expect((await checked(project))[0]).toMatchObject({ atCount: 4, severity: 'danger' });
    delete project.sets[1].facings;
    expect(await checked(project)).toHaveLength(0);
    project.sets = project.sets.slice(0, 1);
    project.moves = [];
    project.sets[0].staging!.deck = pose(40, 20);
    expect(transitionInput(project, 0, 0)!.moveId).toBe(OPENING_CLEARANCE_ID);
    expect((await checked(project, undefined, 0))[0]).toMatchObject({ atCount: 0, severity: 'danger' });
  });

  it('exposes unresolved near-tangent and extremely short travel candidates', async () => {
    const project = fixture();
    for (const set of project.sets) set.staging!.deck = pose(20, 26.75);
    const [tangent] = await checked(project);
    expect(tangent).toMatchObject({ certainty: 'possible', severity: 'warning' });
    expect(tangent.countRange![0]).toBeGreaterThan(3);
    expect(tangent.countRange![1]).toBeLessThan(5);
    expect(tangent.measurement!.lower).toBeLessThan(.25);
    expect(tangent.measurement!.upper).toBeGreaterThanOrEqual(.25);
    project.moves[0].paths = {};
    project.sets[0].staging!.deck = pose(20, 6);
    project.sets[1].staging!.deck = pose(20, 14, { travel: { start: .5, end: .50000001 } });
    expect((await checked(project))[0]).toMatchObject({ certainty: 'possible', countRange: [0, 8] });
  });

  it('checks all maximum-roster pairs against 64 props and allows the worker to cancel', async () => {
    const project = fixture();
    const count = PROJECT_LIMITS.performers, props = STAGING_LIMITS.count;
    project.performers = Array.from({ length: count }, (_, i) => ({ ...project.performers[0], id: `p${i}`, label: `P${i}` }));
    project.stagingObjects = Array.from({ length: props }, (_, i) => ({ id: `s${i}`, name: `Prop ${i}` }));
    project.sets.forEach((set, index) => {
      set.positions = Object.fromEntries(project.performers.map(p => [p.id, { x: 20, y: 20 }]));
      set.staging = Object.fromEntries(project.stagingObjects!.map(prop => [prop.id, pose(20, 20, { angle: index * 90 })]));
    });
    project.moves[0].paths = {};
    const input = transitionInput(project, 1, 0)!;
    const work = clearanceFindings(input);
    let result = work.next();
    while (!result.done) result = work.next();
    expect(result.value).toHaveLength(count * props + props * (props - 1) / 2);
    expect(result.value.every(issue => issue.certainty === 'confirmed' && issue.severity === 'danger')).toBe(true);
    for (const [index, set] of project.sets.entries()) {
      for (const prop of project.stagingObjects) set.staging![prop.id] = pose(22, 20, { angle: index * 90 });
    }
    const moving = clearanceFindings(transitionInput(project, 1, 0)!);
    let steps = 0, checking = moving.next();
    while (!checking.done) { steps++; checking = moving.next(); }
    expect(checking.value).toHaveLength(count * props + props * (props - 1) / 2);
    expect(checking.value.some(issue => issue.performerIds.length && issue.certainty === 'confirmed')).toBe(true);
    expect(checking.value.some(issue => issue.performerIds.length && issue.certainty === 'possible')).toBe(true);
    expect(steps).toBeLessThan(140_000);
    let canceled = false;
    const opening = { ...input, counts: 0 };
    expect(await new TransitionAnalyzer().analyze(opening, () => canceled, async () => { canceled = true; })).toBeNull();
    expect(canceled).toBe(true);
  });
});
