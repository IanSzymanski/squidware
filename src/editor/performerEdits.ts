import { validateAppearance, validateFacings } from '../performerFacing';
import type { DrillSet, PerformerAppearance, PerformerFacings, Project } from '../types';

function withFacings(set: DrillSet, facings: PerformerFacings): DrillSet {
  const { facings: _previous, ...picture } = set;
  return Object.keys(facings).length ? { ...picture, facings } : picture;
}

export function pruneFacings(set: DrillSet, ids: readonly string[]): DrillSet {
  if (!set.facings || !ids.some(id => Object.hasOwn(set.facings!, id))) return set;
  return withFacings(set, Object.fromEntries(Object.entries(set.facings).filter(([id]) => !ids.includes(id))));
}

export function setFacing(project: Project, index: number, ids: string[], angle: number | null): Project {
  const roster = new Set(project.performers.map(p => p.id));
  const picture = project.sets[index];
  if (!picture || !ids.length || ids.some(id => !roster.has(id))) throw Error('Select existing performers at an editable set.');
  const facings = { ...picture.facings };
  for (const id of ids) {
    if (angle === null) delete facings[id];
    else facings[id] = angle;
  }
  validateFacings(facings, roster, 'facings');
  return { ...project, sets: project.sets.map((set, i) => i === index ? withFacings(set, facings) : set) };
}

export function setAppearance(project: Project, { id, role, costumeColor }: {
  id: string;
  role?: PerformerAppearance['role'] | null;
  costumeColor?: string | null;
}): Project {
  return { ...project, performers: project.performers.map(performer => {
    if (performer.id !== id) return performer;
    const { appearance: previous, ...person } = performer;
    const next = validateAppearance({
      role: role === undefined ? previous?.role : role ?? undefined,
      costumeColor: costumeColor === undefined ? previous?.costumeColor : costumeColor ?? undefined,
    }, 'appearance');
    return next ? { ...person, appearance: next } : person;
  }) };
}
