import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { coordinateDescription, coordinatePrecisionLabel } from './coordinates';
import { createBlankProject, exportCoordinatesCsv, performerMoveOutput, sampleProject, serializeProject, setStartCount } from './domain';
import { defaultPreferences, validatePreferences } from './preferences';
import { FieldDrawing } from './components/Field2D';
import { PrintOutput } from './components/PrintOutput';

const field = createBlankProject().field;
function fixture() {
  const project = createBlankProject();
  project.performers = [{ id: 'p', label: 'P1', name: 'Performer', sectionId: project.sections[0].id }];
  const points = [{ x: .21875, y: 20.21875 }, { x: 10.21875, y: 20.21875 }, { x: 10.21875, y: 30.21875 }, { x: 10.21875, y: 30.21875 }, { x: 5.21875, y: 25.21875 }];
  project.sets = points.map((point, index) => ({ id: `set-${index}`, name: `Picture ${index + 1}`, notes: '', positions: { p: point } }));
  project.moves = points.slice(1).map((_, index) => ({ id: `move-${index}`, fromSetId: project.sets[index].id, toSetId: project.sets[index + 1].id, counts: index < 2 ? 16 : 8, tempo: 120, transition: index === 1 ? 'ease' : 'linear', paths: {} }));
  return project;
}

describe('rehearsal coordinate formatting', () => {
  it.each(['whole', 'half', 'quarter'] as const)('rounds %s steps at exact half-increment boundaries on both axes and sides', precision => {
    const increment = precision === 'whole' ? 1 : precision === 'half' ? .5 : .25;
    const options = { coordinatePrecision: precision };
    for (const [steps, rounded] of [[increment / 2 - .000001, 0], [increment / 2, increment], [increment / 2 + .000001, increment]]) {
      const yards = steps * 5 / 8;
      for (const side of [1, 2]) {
        const description = coordinateDescription({ x: side === 1 ? yards : field.width - yards, y: 20 + yards }, field, options);
        expect(description).toBe(rounded === 0 ? `Side ${side}: on the goal line; on back hash` : `Side ${side}: ${rounded} ${rounded === 1 ? 'step' : 'steps'} inside the goal line; ${rounded} ${rounded === 1 ? 'step' : 'steps'} in front of back hash`);
        expect(description).not.toMatch(/0 steps|-0|0-yard/);
      }
      for (const sign of [-1, 1]) {
        const description = coordinateDescription({ x: 40 + sign * yards, y: 20 + sign * yards }, field, options);
        expect(description).toContain(rounded === 0 ? 'on the 40-yard line; on back hash' : `${rounded} ${rounded === 1 ? 'step' : 'steps'} ${sign > 0 ? 'inside' : 'outside'} the 40-yard line; ${rounded} ${rounded === 1 ? 'step' : 'steps'} ${sign > 0 ? 'in front of' : 'behind'} back hash`);
      }
    }
  });

  it('uses explicit goals, neutral midfield and symmetric inside/outside wording', () => {
    expect(coordinateDescription({ x: 0, y: 0 }, field)).toBe('Side 1: on the goal line; on back sideline');
    expect(coordinateDescription({ x: 100, y: field.height }, field)).toBe('Side 2: on the goal line; on front sideline');
    expect(coordinateDescription({ x: 50, y: 20 }, field)).toBe('On the 50-yard line; on back hash');
    expect(coordinateDescription({ x: 49.99, y: 20 }, field)).toBe(coordinateDescription({ x: 50.01, y: 20 }, field));
    expect(coordinateDescription({ x: 41.25, y: 21.25 }, field)).toBe('Side 1: 2 steps inside the 40-yard line; 2 steps in front of back hash');
    expect(coordinateDescription({ x: 58.75, y: 21.25 }, field)).toBe('Side 2: 2 steps inside the 40-yard line; 2 steps in front of back hash');
    expect(coordinateDescription({ x: -1.25, y: 20 }, field)).toBe('Side 1: 2 steps outside the goal line; on back hash');
    expect(coordinateDescription({ x: 101.25, y: 20 }, field)).toBe('Side 2: 2 steps outside the goal line; on back hash');
  });

  it('handles both hash presets, sideline directions and documented reference ties', () => {
    for (const preset of ['college', 'high-school'] as const) {
      const f = { ...field, preset }; const hash = preset === 'college' ? 20 : 160 / 9;
      expect(coordinateDescription({ x: 30, y: hash }, f)).toContain('on back hash');
      expect(coordinateDescription({ x: 30, y: f.height - hash }, f)).toContain('on front hash');
      expect(coordinateDescription({ x: 30, y: hash - .625 }, f)).toContain('1 step behind back hash');
      expect(coordinateDescription({ x: 30, y: f.height - hash + .625 }, f)).toContain('1 step in front of front hash');
      const refs = [0, hash, f.height - hash, f.height];
      for (let i = 0; i < 3; i++) expect(coordinateDescription({ x: 30, y: (refs[i] + refs[i + 1]) / 2 }, f)).toContain('in front of ' + ['back sideline', 'back hash', 'front hash'][i]);
    }
    expect(coordinateDescription({ x: 30, y: 10 }, field)).toContain('16 steps in front of back sideline');
  });

  it('migrates decimal preferences, validates new choices and retains the explicit numeric API', () => {
    for (const coordinateDecimals of [0, 1, 2] as const) {
      const p = validatePreferences({ version: 1, coordinateDecimals });
      expect(p.coordinatePrecision).toBe('decimal');
      expect(coordinateDescription({ x: .21875, y: 20 }, field, p)).toBe(coordinateDescription({ x: .21875, y: 20 }, field, coordinateDecimals));
      expect(coordinateDescription({ x: .21875, y: 20 }, field, { coordinateDecimals })).toBe(coordinateDescription({ x: .21875, y: 20 }, field, coordinateDecimals));
    }
    expect(defaultPreferences().coordinatePrecision).toBe('quarter');
    expect(validatePreferences({ version: 0, zoom: 1.1 }).coordinatePrecision).toBe('quarter');
    expect(() => validatePreferences({ coordinatePrecision: 'eighth' })).toThrow();
    expect(coordinatePrecisionLabel({ coordinatePrecision: 'half' })).toBe('Half steps');
    expect(coordinatePrecisionLabel(1)).toBe('Decimal steps (1 place)');
  });
});

describe('incoming movement descriptions', () => {
  it('derives cardinal and diagonal directions, average sizes and eased peaks from unrounded movement', () => {
    const project = fixture();
    const horizontal = performerMoveOutput(project, 1, 'p');
    expect(horizontal.direction).toBe('Toward Side 2');
    expect(horizontal.averageStepsPerFive).toBe(8); expect(horizontal.peakStepsPerFive).toBe(8);
    const eased = performerMoveOutput(project, 2, 'p');
    expect(eased.direction).toBe('Toward front sideline');
    expect(eased.description).toContain('Average 8 steps per 5 yd; peak 5.33 steps per 5 yd (eased)');
    const at = setStartCount(project, 1); const delta = .001;
    const a = sampleProject(project, at + 8 - delta).positions.p; const b = sampleProject(project, at + 8 + delta).positions.p;
    const peakYardsPerCount = Math.hypot(b.x - a.x, b.y - a.y) / (2 * delta);
    expect(5 / peakYardsPerCount).toBeCloseTo(eased.peakStepsPerFive!, 5);
    const diagonal = performerMoveOutput(project, 4, 'p');
    expect(diagonal.direction).toBe('Toward Side 1 and back sideline');
    expect(diagonal.averageStepsPerFive).toBeCloseTo(40 / Math.sqrt(50));
    const forwardDiagonal = fixture(); forwardDiagonal.sets[4].positions.p = { x: 15, y: 35 };
    expect(performerMoveOutput(forwardDiagonal, 4, 'p').direction).toBe('Toward Side 2 and front sideline');
  });

  it('distinguishes openings and holds without zero divisions or movement claims', () => {
    const project = fixture();
    expect(performerMoveOutput(project, 0, 'p')).toMatchObject({ kind: 'opening', counts: 0, averageStepsPerFive: null });
    const hold = performerMoveOutput(project, 3, 'p');
    expect(hold).toMatchObject({ kind: 'hold', description: 'Hold for 8 counts', averageStepsPerFive: null, peakStepsPerFive: null });
    expect(JSON.stringify(hold)).not.toMatch(/Infinity|NaN/);
    project.moves[2].counts = 1; expect(performerMoveOutput(project, 3, 'p').description).toBe('Hold for 1 count');
    expect(() => performerMoveOutput(project, -1, 'p')).toThrow();
    expect(() => performerMoveOutput(project, 1, 'missing')).toThrow();
  });

  it.each(['whole', 'half', 'quarter'] as const)('shares %s output across field labels, CSV and dot sheets without edits', coordinatePrecision => {
    const project = fixture(); const before = serializeProject(project); const options = { coordinatePrecision };
    const expected = coordinateDescription(project.sets[0].positions.p, project.field, options);
    const drawing = renderToStaticMarkup(<FieldDrawing project={project} positions={project.sets[0].positions} coordinateFormat={options} />);
    const print = renderToStaticMarkup(<PrintOutput project={project} mode="coordinates" coordinateFormat={options} />);
    const csv = exportCoordinatesCsv(project, options);
    expect(drawing).toContain(expected); expect(print).toContain(expected); expect(csv).toContain(`"${expected}"`);
    expect(print).toContain('Move into set'); expect(print).toContain('Hold for 8 counts'); expect(print).toContain('Opening position');
    expect(csv).toContain('"Average step size (steps/5 yd)"'); expect(csv).toContain('"Peak step size (steps/5 yd)"');
    expect(csv).toContain('"0.219","20.219"');
    expect(serializeProject(project)).toBe(before);
    expect(performerMoveOutput(project, 1, 'p', options).averageStepsPerFive).toBe(8);
  });
});
