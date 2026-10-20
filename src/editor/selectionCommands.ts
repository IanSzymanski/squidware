import { PROJECT_LIMITS, uid } from '../domain';
import { invertSelection, previewSelection } from '../selectionTools';
import type { CommandDefinition, CommandId } from './commands';
import type { EditorState } from './state';
import { isAtActiveSet } from './editMode';
import { filterCast } from './castSelection';

const define = <I extends CommandId>(definition: CommandDefinition<I>) => definition;
export const canChooseSelection = (s: EditorState, reviewing = false) => !s.ui.dialog && !s.ui.pendingDraft && !s.project.transactionName && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview && (reviewing || !s.ui.selectionPreview);
export const canSelectSection = (s: EditorState) => !s.ui.dialog && !s.project.transactionName && !s.ui.selectionPreview;
const canPreview = (s: EditorState) => canChooseSelection(s, true) && !s.playback.playing && isAtActiveSet(s);
const members = (s: EditorState) => [...new Set(s.selection.selectedIds)].filter(id => s.project.present.performers.some(p => p.id === id));
const groupExists = (s: EditorState, id: string) => s.project.present.selectionGroups?.some(g => g.id === id) ?? false;
const combine = (current: string[], next: string[], additive = false) => additive ? [...new Set([...current, ...next])] : next;

export function selectionReviewCurrent(s: EditorState): boolean {
  const r = s.ui.selectionPreview;
  return !!r && !s.ui.pendingDraft && !s.project.transactionName && !s.ui.dialog && !s.playback.playing && isAtActiveSet(s) && s.ui.view === '2d' && s.ui.workspace === 'design'
    && r.revision === s.project.revision && r.setId === s.project.present.sets[s.selection.activeIndex]?.id
    && r.query === s.ui.castQuery && r.section === s.ui.sectionFilter
    && r.initialIds.length === s.selection.selectedIds.length && r.initialIds.every((id, i) => s.selection.selectedIds[i] === id);
}

export const selectionCommands = {
  'selection.tools': define({ id: 'selection.tools', name: 'Selection tools', description: 'Review rank, file or lasso selection; invert the current Cast filters; manage saved performer groups.', arguments: {}, enabled: s => canChooseSelection(s, true), execute: c => c.patch('ui', { selectionToolsOpen: true }) }),
  'selection.close': define({ id: 'selection.close', name: 'Close selection tools', description: 'Cancel any selection preview and keep the previous selection.', arguments: {}, enabled: () => true, execute: c => c.patch('ui', { selectionToolsOpen: false, selectionPreview: null }) }),
  'selection.section': define({ id: 'selection.section', name: 'Select section', description: 'Select the whole section, ignoring Cast filters. Shift-click or Shift-Enter adds it to the current selection.', arguments: { id: 'section ID', additive: 'boolean?' }, enabled: (s, a) => canSelectSection(s) && !!a && s.project.present.sections.some(section => section.id === a.id), execute: (c, a) => { const s = c.getState(); c.patch('selection', { selectedIds: combine(s.selection.selectedIds, s.project.present.performers.filter(p => p.sectionId === a.id).map(p => p.id), a.additive) }); } }),
  'selection.invert': define({ id: 'selection.invert', name: 'Invert visible selection', description: 'Invert performers matching the current Cast search and section filters. Keep selections outside those filters.', arguments: {}, enabled: s => canChooseSelection(s), execute: c => { const s = c.getState(); c.patch('selection', { selectedIds: invertSelection(s.selection.selectedIds, filterCast(s.project.present.performers, s.ui.castQuery, s.ui.sectionFilter).map(p => p.id)) }); } }),
  'selection.preview': define({ id: 'selection.preview', name: 'Preview geometric selection', description: 'Preview rank, file or lasso candidates in the current Cast filters. Review near-boundary performers before Apply.', arguments: { spec: 'SelectionSpec', additive: 'boolean?' }, enabled: (s, a) => canPreview(s) && !!a,
    execute: (c, a) => { const s = c.getState(), set = s.project.present.sets[s.selection.activeIndex]; const scope = filterCast(s.project.present.performers, s.ui.castQuery, s.ui.sectionFilter).map(p => p.id);
      const spec = structuredClone(a.spec), result = previewSelection(set.positions, scope, spec);
      c.patch('ui', { workspace: 'design', view: '2d', selectionToolsOpen: true, selectionPreview: { spec, ...result, additive: !!a.additive, initialIds: [...s.selection.selectedIds], revision: s.project.revision, setId: set.id, query: s.ui.castQuery, section: s.ui.sectionFilter } });
    } }),
  'selection.review': define({ id: 'selection.review', name: 'Review selection candidates', description: 'Include or exclude preview candidates without changing the production or the current selection.', arguments: { ids: 'candidate IDs', additive: 'boolean' }, enabled: (s, a) => selectionReviewCurrent(s) && !!a && Array.isArray(a.ids) && typeof a.additive === 'boolean' && a.ids.every(id => s.ui.selectionPreview!.candidates.some(p => p.id === id)), execute: (c, a) => c.patch('ui', { selectionPreview: { ...c.getState().ui.selectionPreview!, ids: [...new Set(a.ids)], additive: a.additive } }) }),
  'selection.apply': define({ id: 'selection.apply', name: 'Apply selection', description: 'Accept the reviewed selection. This does not create a production edit or an undo entry.', arguments: {}, enabled: selectionReviewCurrent, execute: c => { const r = c.getState().ui.selectionPreview!; c.patch('ui', { selectionPreview: null, selectionToolsOpen: false }); c.patch('selection', { selectedIds: combine(r.initialIds, r.ids, r.additive) }); } }),
  'selection.cancel': define({ id: 'selection.cancel', name: 'Cancel selection preview', description: 'Keep the previous selection without editing the production.', arguments: {}, enabled: s => !!s.ui.selectionPreview, execute: c => c.patch('ui', { selectionPreview: null }) }),
  'group.create': define({ id: 'group.create', name: 'Save selection group', description: 'Save the current performer IDs as a named production group, independent of sections.', arguments: { name: 'group name' }, enabled: s => canChooseSelection(s) && !!members(s).length && (s.project.present.selectionGroups?.length ?? 0) < PROJECT_LIMITS.selectionGroups, execute: (c, a) => { const ids = members(c.getState()); c.edit(p => ({ ...p, selectionGroups: [...p.selectionGroups ?? [], { id: uid(), name: a.name.trim(), performerIds: ids }] })); } }),
  'group.rename': define({ id: 'group.rename', name: 'Rename selection group', description: 'Rename this production group without changing its members.', arguments: { id: 'group ID', name: 'group name' }, enabled: (s, a) => canChooseSelection(s) && !!a && groupExists(s, a.id), execute: (c, a) => c.edit(p => ({ ...p, selectionGroups: p.selectionGroups!.map(g => g.id === a.id ? { ...g, name: a.name.trim() } : g) })) }),
  'group.update': define({ id: 'group.update', name: 'Replace group members', description: 'Replace this group’s saved members with the current explicit selection.', arguments: { id: 'group ID' }, enabled: (s, a) => canChooseSelection(s) && !!members(s).length && !!a && groupExists(s, a.id), execute: (c, a) => { const ids = members(c.getState()); c.edit(p => ({ ...p, selectionGroups: p.selectionGroups!.map(g => g.id === a.id ? { ...g, performerIds: ids } : g) })); } }),
  'group.remove': define({ id: 'group.remove', name: 'Delete selection group', description: 'Delete the saved group; keep every performer and position.', arguments: { id: 'group ID' }, enabled: (s, a) => canChooseSelection(s) && !!a && groupExists(s, a.id), execute: (c, a) => c.edit(p => ({ ...p, selectionGroups: p.selectionGroups!.filter(g => g.id !== a.id) })) }),
  'group.select': define({ id: 'group.select', name: 'Recall selection group', description: 'Select saved group members across all sections and Cast filters. Add mode preserves the current selection.', arguments: { id: 'group ID', additive: 'boolean?' }, enabled: (s, a) => canChooseSelection(s) && !!a && !!s.project.present.selectionGroups?.find(g => g.id === a.id)?.performerIds.length, execute: (c, a) => { const s = c.getState(); c.patch('selection', { selectedIds: combine(s.selection.selectedIds, [...s.project.present.selectionGroups!.find(g => g.id === a.id)!.performerIds], a.additive) }); } }),
};
