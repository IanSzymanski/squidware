import { createBlankProject, sampleProject, totalCounts } from '../domain';
import { LEG_MOTION_LOOKAHEAD, type LegMotionFrame } from '../components/legMotion';
import type { Point, Project } from '../types';

export const motionScenarios = {
  hold: { label: 'Neutral hold', x: 0, y: 0 },
  forward: { label: 'Forward march', x: 0, y: 3.5 },
  mark: { label: 'Mark time', x: 0, y: 0 },
  backward: { label: 'Backward march', x: 0, y: -3.5 },
  choreography: { label: 'Plié and flag cues', x: 0, y: 0 },
  lateral: { label: 'Lateral march', x: 3.5, y: 0 },
};

export type MotionScenario = keyof typeof motionScenarios;
export type PreviewCastSize = 64 | 500;

const fixtureId = (number: number) => `72bcf837-68b4-4000-8000-${number.toString(16).padStart(12, '0')}`;

export function createLegMotionFixture(size: PreviewCastSize, scenario: MotionScenario): Project {
  const project = createBlankProject();
  const motion = motionScenarios[scenario];
  const columns = size === 64 ? 8 : 25;
  const columnSpacing = size === 64 ? 2.35 : 1.65;
  const rowSpacing = size === 64 ? 2.35 : 1.25;
  const position = (index: number, endpoint: number): Point => ({
    x: project.field.width / 2 - (index % columns) * columnSpacing + endpoint * motion.x,
    y: project.field.height / 2 - Math.floor(index / columns) * rowSpacing + endpoint * motion.y,
  });
  // Keep the closest performer at midfield at count 4 in every camera view.
  const basePerformers = Array.from({ length: size }, (_, index) => ({
    id: fixtureId(100 + index),
    name: `Performer ${index + 1}`,
    label: `P${index + 1}`,
    sectionId: project.sections[Math.floor(index / columns) % project.sections.length].id,
  }));
  const performers = scenario === 'choreography'
    ? basePerformers.map((person, index) => index % 4 === 0 ? { ...person, appearance: { equipment: 'flag', flagColor: '#dd8cae' } } : person)
    : basePerformers;
  const facings = Object.fromEntries(performers.map(({ id }) => [id, 0]));
  const sets = [-0.5, 0.5].map((endpoint, index) => ({
    id: fixtureId(index + 1),
    name: index === 0 ? 'Start' : 'Finish',
    notes: '',
    facings,
    positions: Object.fromEntries(performers.map(({ id }, performer) => [id, position(performer, endpoint)])),
  }));
  const move = { id: fixtureId(3), fromSetId: sets[0].id, toSetId: sets[1].id, counts: 8, tempo: 120, transition: 'linear' as const, paths: {} };
  const anchor = { moveId: move.id, fromSetId: move.fromSetId, toSetId: move.toSetId };
  return {
    ...project,
    id: fixtureId(4),
    title: motion.label,
    performers,
    sets,
    moves: [move],
    ...(scenario === 'choreography' ? { choreography: [
      { ...anchor, id: fixtureId(5), preset: 'plie' as const, performerIds: performers.map(({ id }) => id),
        start: 0, end: 8, transition: 2, turnout: 35, depth: .13 },
      { ...anchor, id: fixtureId(6), preset: 'flag-up' as const, performerIds: performers.filter((_, i) => i % 4 === 0).map(({ id }) => id),
        start: 2, end: 7, transition: 1 },
    ] } : {}),
  };
}

export function legMotionFrame(project: Project, count: number, markTime?: ReadonlySet<string>): LegMotionFrame {
  const nextCount = Math.min(count + LEG_MOTION_LOOKAHEAD, totalCounts(project));
  return { count, nextPositions: sampleProject(project, nextCount).positions, markTime };
}
