import { validateProject } from '../domain';
import { formationAssignmentOrder, formationCenter } from '../formationAssignment';
import { previewFormation } from '../formationPreview';
import type { FormationResult } from '../formationPreview';
import { affinePoint } from '../transforms';
import type { FormationAssignment, FormationKind, FormationOptions, Point, Project } from '../types';
import { validateTemplate } from './library';
import { PROJECT_LIMITS } from '../projectValidation';
import type { FormationTemplate } from './library';

export function captureParametricFormation(name: string, shape: FormationKind, options: FormationOptions, sourceCount: number): FormationTemplate {
  return validateTemplate({ kind: 'formation', name, sourceCount, coordinateFrame: 'yards-relative-center',
    geometry: { kind: 'parametric', shape, width: options.width, height: options.height, columns: options.columns } }) as FormationTemplate;
}

/** Snapshot geometry contains no performer IDs, labels, names, sections or project metadata. */
export function captureFormationSnapshot(project: Project, setIndex: number, ids: readonly string[], name: string): FormationTemplate {
  const source = validateProject(project);
  if (!Number.isInteger(setIndex) || !source.sets[setIndex]) throw new Error('Choose an existing set.');
  const positions = source.sets[setIndex].positions;
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(positions, id))) throw new Error('Select existing performers exactly once before saving a formation.');
  const center = formationCenter(positions, ids);
  const points = ids.map(id => ({ x: positions[id].x - center.x, y: positions[id].y - center.y }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  return validateTemplate({ kind: 'formation', name, sourceCount: ids.length, coordinateFrame: 'yards-relative-center',
    geometry: { kind: 'snapshot', points } }) as FormationTemplate;
}

export interface TemplatePlacement { center: Point; rotation: number; assignment: FormationAssignment }

/** Pure preview. Applying its updates belongs to a guarded editor command, not this module. */
export function previewFormationTemplate(input: FormationTemplate, positions: Record<string, Point>, ids: readonly string[], field: Project['field'], placement: TemplatePlacement): FormationResult {
  try {
    const template = validateTemplate(input);
    if (template.kind !== 'formation') throw new Error('Choose a formation template.');
    if (!ids.length || ids.length > PROJECT_LIMITS.performers || new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(positions, id))) throw new Error('Select 1–500 existing performers exactly once before applying a formation.');
    if (![placement.center.x, placement.center.y, placement.rotation].every(Number.isFinite) || Math.abs(placement.rotation) > 3600) throw new Error('Use a finite center and rotation from −3600° to 3600°.');
    if (placement.center.x < 0 || placement.center.y < 0 || placement.center.x > field.width || placement.center.y > field.height) throw new Error('The formation center must be inside the field.');
    if (!['position', 'roster'].includes(placement.assignment)) throw new Error('Choose positional or roster assignment.');
    const geometry = template.geometry;
    if (geometry.kind === 'parametric') return previewFormation(positions, ids, geometry.shape, { ...geometry, ...placement }, field);
    if (ids.length !== template.sourceCount) throw new Error(`This saved picture requires exactly ${template.sourceCount} selected performers; ${ids.length} are selected. Parametric formations support different member counts.`);
    // Snapshot slots are in local x/y order; source assignment uses the same rotated axes.
    const order = formationAssignmentOrder(positions, ids, 'line', { ...placement, width: 1, height: 0, columns: 1 });
    const points = geometry.points.map(point => affinePoint({ x: placement.center.x + point.x, y: placement.center.y + point.y }, placement.center, placement.rotation, 1));
    let total = 0, maximum = 0, changed = false, outside = false;
    const updates = Object.fromEntries(order.map((id, i) => {
      const point = points[i];
      const pointOutside = point.x < -1e-8 || point.y < -1e-8 || point.x > field.width + 1e-8 || point.y > field.height + 1e-8;
      outside ||= pointOutside;
      const after = { x: Math.max(0, Math.min(field.width, point.x)), y: Math.max(0, Math.min(field.height, point.y)) };
      // Preserve out-of-field destinations for review, absorbing only edge roundoff.
      if (pointOutside) { after.x = point.x; after.y = point.y; }
      const distance = Math.hypot(after.x - positions[id].x, after.y - positions[id].y);
      total += distance; maximum = Math.max(maximum, distance); changed ||= distance > 1e-9;
      return [id, after];
    }));
    return { positions: { ...positions, ...updates }, updates, changed, travel: { total, maximum },
      error: outside ? 'The preview crosses a field boundary. Move its center before applying.' : null };
  } catch (error) { return { positions, updates: {}, changed: false, travel: null, error: (error as Error).message }; }
}
