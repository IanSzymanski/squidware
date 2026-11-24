import { incompatibleFlagPerformers, validateChoreography } from '../choreography';
import type { ChoreographyCue, Project } from '../types';

export function saveChoreographyCue(project: Project, cue: ChoreographyCue): Project {
  if (cue.preset === 'flag-up') {
    const incompatible = incompatibleFlagPerformers(project, cue.performerIds);
    if (incompatible.length) {
      const names = incompatible.slice(0, 4).map(person => person.label).join(', ');
      throw new Error(`Assign flag equipment to ${names}${incompatible.length > 4 ? ' and the other selected performers' : ''} before saving a flag cue.`);
    }
  }
  const previous = project.choreography ?? [];
  const cues = previous.some(item => item.id === cue.id)
    ? previous.map(item => item.id === cue.id ? cue : item) : [...previous, cue];
  return { ...project, choreography: validateChoreography(cues, project) };
}

export function removeChoreographyCue(project: Project, id: string): Project {
  const { choreography, ...plain } = project;
  const others = choreography?.filter(cue => cue.id !== id);
  return others?.length ? { ...plain, choreography: others } : plain;
}
