import { assertAssignmentMapping, pruneAssignmentConstraints, validateAssignmentConstraints } from './assignmentConstraints';
import { validateScatterFormation } from './scatterFormations';
import { bezierFormationPoints, validateBezierFormation } from './bezierFormations';
import { generateFormation } from './formationGeometry';
import { PROJECT_LIMITS } from './projectValidation';
import type { LiveFormation, Point, Project } from './types';

const fail = (message: string): never => { throw Error(`Invalid live formation: ${message}`); };
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail('expected an object.');
const id = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.length <= PROJECT_LIMITS.text.id && /^[A-Za-z0-9_-]+$/.test(v) && !['__proto__','constructor','prototype'].includes(v) ? v : fail('invalid ID.');
const number = (v: unknown, min: number, max: number, integer = false): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fail(`expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
export function liveFormationName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > PROJECT_LIMITS.text.groupName || /[\u0000-\u001f]/.test(value)) fail('use a name of 1–80 characters without control characters.');
  return (value as string).trim();
}
export function liveFormationPoints(shape: LiveFormation, field: Project['field']): Record<string, Point> {
  const points = shape.scatter ? shape.scatter.points : shape.bezier ? bezierFormationPoints(shape.bezier, shape.slotCount) : generateFormation(shape.kind, shape.slotCount, shape.options);
  return Object.fromEntries(shape.members.map(member => {
    const point = points[member.slot];
    if (!point || point.x < -1e-8 || point.y < -1e-8 || point.x > field.width + 1e-8 || point.y > field.height + 1e-8) fail('the preview crosses a field boundary. Move its center or reduce its dimensions.');
    return [member.performerId, { x: Math.max(0, Math.min(field.width, point.x)), y: Math.max(0, Math.min(field.height, point.y)) }];
  }));
}
/** Slots and ownership are semantic constraints beyond the portable JSON schema. */
export function validateLiveFormations(value: unknown, positions: Record<string, Point>, field: Project['field'],cast?:Project['performers'],sections?:string[]): LiveFormation[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > PROJECT_LIMITS.performers) fail('expected at most 500 formations per set.');
  const owners = new Set<string>(), ids = new Set<string>(), names = new Set<string>();
  const shapes = (value as unknown[]).map(raw => {
    const data = object(raw), shapeId = id(data.id), name = liveFormationName(data.name);
    if (ids.has(shapeId) || names.has(name.toLowerCase())) fail('IDs and names must be unique on each set.');
    ids.add(shapeId); names.add(name.toLowerCase());
    if (!['line','arc','circle','block','curve'].includes(data.kind as string)) fail('unknown shape kind.');
    const o = object(data.options), center = object(o.center);
    if (!['position','roster'].includes(o.assignment as string)) fail('choose positional or roster assignment.');
    const options = { center: { x: number(center.x,0,field.width), y: number(center.y,0,field.height) }, width: number(o.width,.1,200), height: number(o.height,0,200), rotation: number(o.rotation,-3600,3600), columns: number(o.columns,1,500,true), assignment: o.assignment as 'position' | 'roster' };
    const slotCount = number(data.slotCount,1,500,true);
    if (!Array.isArray(data.members) || !data.members.length || data.members.length > slotCount) fail('choose at least one member within the slot count.');
    const slots = new Set<number>();
    const members = (data.members as unknown[]).map(rawMember => {
      const m = object(rawMember), performerId = id(m.performerId), slot = number(m.slot,0,slotCount-1,true);
      if (!Object.hasOwn(positions,performerId)) fail('a member is missing from the cast.');
      if (owners.has(performerId)) fail('a performer belongs to another live formation. Detach that membership first.');
      if (slots.has(slot)) fail('two members occupy the same slot.');
      owners.add(performerId); slots.add(slot); return { performerId, slot };
    }).sort((a,b)=>a.slot-b.slot);
    if (data.bezier !== undefined && data.kind !== 'curve') fail('Bézier geometry requires a curve formation.');
    if (data.scatter !== undefined && (data.kind !== 'block' || data.bezier !== undefined)) fail('scatter geometry requires a block container without Bézier geometry.');
    const scatter = data.scatter === undefined ? undefined : validateScatterFormation(data.scatter,slotCount,field);
    if (scatter?.pinnedSlots.some(slot=>!members.some(m=>m.slot===slot))) fail('only occupied scatter slots may be pinned.');
    const bezier = data.bezier === undefined ? undefined : validateBezierFormation(data.bezier,field);
    if(data.assignmentConstraints!==undefined&&!cast)fail('assignment constraints require cast context.');
    const assignmentConstraints=data.assignmentConstraints===undefined?undefined:validateAssignmentConstraints(data.assignmentConstraints,members.map(m=>m.performerId),slotCount,sections??[]);
    if(assignmentConstraints)assertAssignmentMapping(assignmentConstraints,members,cast!);
    const shape: LiveFormation = { ...(assignmentConstraints?{assignmentConstraints}:{}), ...(scatter ? {scatter} : {}), ...(bezier ? {bezier} : {}), id: shapeId, name, kind: data.kind as LiveFormation['kind'], options, slotCount, members };
    const generated = liveFormationPoints(shape,field);
    for (const [performerId,point] of Object.entries(generated)) if (Math.hypot(point.x-positions[performerId].x, point.y-positions[performerId].y) > 1e-6) fail('stored member positions disagree with the shape.');
    return shape;
  });
  return shapes.length ? shapes : undefined;
}
export function uniqueLiveName(shapes: readonly LiveFormation[], base = 'Formation'): string {
  const names = new Set(shapes.map(s=>s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let n=2;;n++) { const name = `${base.slice(0,70)} ${n}`; if (!names.has(name.toLowerCase())) return name; }
}
/** Position edits detach only the dots they actually move. No implicit redistribution.
 * Explicit metadata edits are validated instead of being silently repaired. */
export function reconcileLiveFormations(previous: Project, next: Project): Project {
  const before = new Map(previous.sets.map(s=>[s.id,s]));
  let changed = false;
  const sets = next.sets.map(set => {
    const source = before.get(set.id);
    if (!source?.liveFormations || source.liveFormations !== set.liveFormations) return set;
    let detached = false;
    const shapes = source.liveFormations.flatMap(shape => {
      const members = shape.members.filter(({performerId}) => {
        const a = source.positions[performerId], b = set.positions[performerId];
        const keep = !!a && !!b && a.x === b.x && a.y === b.y;
        if (!keep) detached = true;
        return keep;
      });
      return members.length ? [{...shape,members,...(shape.assignmentConstraints?{assignmentConstraints:pruneAssignmentConstraints(shape.assignmentConstraints,members)}:{}),...(shape.scatter?{scatter:{...shape.scatter,pinnedSlots:shape.scatter.pinnedSlots.filter(slot=>members.some(m=>m.slot===slot))}}:{})}] : [];
    });
    if (!detached) return set;
    changed = true;
    const {liveFormations: _old, ...plain} = set;
    return shapes.length ? {...plain,liveFormations:shapes} : plain;
  });
  return changed ? {...next,sets} : next;
}
