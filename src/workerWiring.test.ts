import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoProject } from './domain';
import { transitionInput } from './analysis/input';
import { assignmentProblem } from './assignmentOptimization';
import { emptyAssignmentConstraints } from './assignmentConstraints';
import { createEditorStore } from './editor/store';

/** Six performers over three sets; one unselected performer curves (a cubic path) through the second move, so every
 * movement check of that move takes the analyzer's detailed path, which pauses through the job's yield. */
function curvedShow() {
  const project = createDemoProject(); project.performers = project.performers.slice(0, 6);
  project.sets = project.sets.slice(0, 3).map((set, index) => ({ ...set, positions: Object.fromEntries(project.performers.map((p, i) => [p.id, i < 4 ? { x: index === 1 ? 20 + i * 20 : 80 - i * 20, y: 25 } : { x: i === 4 ? 5 : 95, y: 45 }])) }));
  project.moves = project.moves.slice(0, 2).map(m => ({ ...m, counts: 8, transition: 'ease' as const, paths: {} }));
  project.moves[1].paths[project.performers[5].id] = { segments: [{ id: 'curve', kind: 'cubic', startCount: 0, endCount: 8, control1: { x: 90, y: 35 }, control2: { x: 98, y: 50 } }] };
  return { project, ids: project.performers.slice(0, 4).map(p => p.id) };
}
const realTimeout = globalThis.setTimeout;
/** Load a worker module against a stand-in global scope, then run one job with timers frozen. A pause that waits on a
 * timer never resumes, so the job posts nothing; a message yield finishes it. */
async function runFrozen(load: () => Promise<unknown>, data: unknown) {
  const posted: unknown[] = [], scope = { onmessage: null as null | ((event: { data: unknown }) => Promise<void>), postMessage: (message: unknown) => { posted.push(message); } };
  vi.resetModules(); vi.stubGlobal('self', scope); await load();
  vi.useFakeTimers();
  await Promise.race([scope.onmessage!({ data }), new Promise(resolve => realTimeout(resolve, 3000))]);
  return posted;
}

describe('budgeted worker jobs yield with a message, so clamped or coalesced worker timers cannot stretch them', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('the movement comparison worker (group movement and formation transitions) finishes a detailed comparison', async () => {
    const { project, ids } = curvedShow(), input = transitionInput(project, 2, 0)!;
    expect(input.tracks.some(t => t.path?.segments.some(s => s.kind === 'cubic'))).toBe(true);
    const posted = await runFrozen(() => import('./formationTransition.worker'), { generation: 1, current: input, proposed: input, ids });
    expect(posted).toEqual([{ generation: 1, result: expect.objectContaining({ issueCount: expect.any(Number) }) }]);
  }, 10000);

  it('the assignment comparison worker finishes, including the movement checks of a curved adjacent move', async () => {
    const { project, ids } = curvedShow(), store = createEditorStore(project);
    store.dispatch('set.select', { index: 1 }); store.setValue('selection', 'selectedIds', ids); store.dispatch('formation.preview', { kind: 'line' });
    store.dispatch('formation.update', { options: { center: { x: 50, y: 25 }, width: 60, height: 0, columns: 4, rotation: 0, assignment: 'roster' } });
    const problem = assignmentProblem(project, store.getState().ui.formationPreview!, 0);
    expect(problem.checks.find(c => c.side === 'outgoing')!.input.tracks.some(t => t.path?.segments.some(s => s.kind === 'cubic'))).toBe(true);
    const posted = await runFrozen(() => import('./assignment.worker'), { generation: 1, problem, constraints: emptyAssignmentConstraints() });
    expect(posted).toEqual([{ generation: 1, result: expect.objectContaining({ proposals: expect.any(Array) }) }]);
    expect((posted[0] as { result: { current: { metrics: { flags: unknown } } } }).result.current.metrics.flags).not.toBeNull();
  }, 10000);

  it('the per-move check worker finishes a detailed move behind its 15-second watchdog', async () => {
    const { project } = curvedShow(), input = transitionInput(project, 2, 0)!;
    const posted = await runFrozen(() => import('./analysis/analysis.worker'), { revision: 7, input });
    expect(posted).toEqual([{ revision: 7, result: expect.objectContaining({ issues: expect.any(Array) }) }]);
  }, 10000);
});
