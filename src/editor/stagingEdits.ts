import { validateStagingObjects, validateStagingPoses, type StagingObject, type StagingPose } from '../staging';
import type { Project } from '../types';

export interface StagingEdit {
  object: StagingObject;
  pose: StagingPose;
  create: boolean;
}

export function saveStagingObject(project: Project, index: number, { object, pose, create }: StagingEdit): Project {
  const objects = project.stagingObjects ?? [];
  if (create === objects.some(({ id }) => id === object.id)) {
    throw new Error(create ? 'This prop ID already exists.' : 'This prop no longer exists.');
  }
  const validated = validateStagingObjects(create ? [...objects, object] : objects.map(item => item.id === object.id ? object : item),
    new Set(project.performers.map(({ id }) => id)))!;
  const stagingObjects = !create && validated.every((item, i) => item.name === objects[i].name && item.model === objects[i].model && item.footprint === objects[i].footprint)
    ? objects : validated;
  const checked = validateStagingPoses({ [object.id]: pose }, [object], project.field, 'Prop pose')![object.id];
  const { travel: _travel, ...placement } = checked;
  const sets = project.sets.map((set, i) => {
    if (!create && i !== index) return set;
    return { ...set, staging: { ...set.staging, [object.id]: i === index ? checked : placement } };
  });
  return { ...project, stagingObjects, sets };
}

export function removeStagingObject({ stagingObjects, ...project }: Project, id: string): Project {
  const remaining = stagingObjects?.filter(object => object.id !== id) ?? [];
  const sets = project.sets.map(({ staging, ...set }) => {
    if (!remaining.length) return set;
    const { [id]: _removed, ...poses } = staging!;
    return { ...set, staging: poses };
  });
  return { ...project, sets, ...(remaining.length ? { stagingObjects: remaining } : {}) };
}
