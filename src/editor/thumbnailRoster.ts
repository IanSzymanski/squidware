import type { Performer, Section } from '../types';
export interface ThumbnailDot { readonly id: string; readonly color: string }
/** Retain the visible drawing input when names, labels or unused section colors change. */
export function createThumbnailRosterSelector() {
  let lastPerformers: readonly Performer[] | undefined; let lastSections: readonly Section[] | undefined;
  let dots: readonly ThumbnailDot[] = [];
  return (performers: readonly Performer[], sections: readonly Section[]): readonly ThumbnailDot[] => {
    if (performers === lastPerformers && sections === lastSections) return dots;
    const colors = new Map(sections.map(section => [section.id, section.color]));
    const next = performers.map(performer => ({ id: performer.id, color: colors.get(performer.sectionId) ?? '#d0f398' }));
    if (next.length !== dots.length || next.some((dot, index) => dot.id !== dots[index].id || dot.color !== dots[index].color)) dots = next;
    lastPerformers = performers; lastSections = sections;
    return dots;
  };
}
export function sectionMemberships(performers: readonly Performer[], sections: readonly Section[]): ReadonlyMap<string, readonly string[]> {
  const groups = new Map(sections.map(section => [section.id, [] as string[]]));
  for (const performer of performers) groups.get(performer.sectionId)?.push(performer.id);
  return groups;
}
export const sectionIsSelected = (ids: readonly string[], selected: ReadonlySet<string>) => ids.length > 0 && ids.every(id => selected.has(id));

