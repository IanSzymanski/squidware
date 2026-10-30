import { createBlankProject, generateFormation, uid, validateProject } from '../domain';
import type { Project } from '../types';
import { validateTemplate } from './library';
import type { ShowTemplate } from './library';

/** Names and labels are private by default; only section names have an explicit opt-in. */
export function captureShowTemplate(project: Project, name: string, options: { includeSectionNames?: boolean } = {}): ShowTemplate {
  const source = validateProject(project);
  return validateTemplate({ kind: 'show', name, field: source.field, openingTiming: source.openingTiming,
    sections: source.sections.map((section, i) => ({ name: options.includeSectionNames ? section.name : `Section ${i + 1}`,
      color: section.color, count: source.performers.filter(performer => performer.sectionId === section.id).length })) }) as ShowTemplate;
}

/** Always creates a new identity and a new opening picture, never copies a production. */
export function productionFromTemplate(input: ShowTemplate): Project {
  const template = validateTemplate(input);
  if (template.kind !== 'show') throw new Error('Choose a show template to create a production.');
  const blank = createBlankProject();
  const sections = template.sections.map(section => ({ id: uid(), name: section.name, color: section.color }));
  const performers = template.sections.flatMap((section, i) => Array.from({ length: section.count }, (_, j) => ({
    id: uid(), sectionId: sections[i].id, label: `S${i + 1}-${j + 1}`, name: '',
  })));
  const points = generateFormation('block', performers.length, { center: { x: template.field.width / 2, y: template.field.height / 2 },
    width: template.field.width * .9, height: template.field.height * .9, rotation: 0, columns: Math.min(25, Math.max(1, performers.length)) });
  return validateProject({ ...blank, ensemble: '', field: template.field, sections, performers, openingTiming: template.openingTiming,
    sets: [{ ...blank.sets[0], positions: Object.fromEntries(performers.map((performer, i) => [performer.id, points[i]])) }] });
}
