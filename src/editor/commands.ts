import { fitFormationToField, generateFormation, PROJECT_LIMITS, sampleProject, setStartCount, totalCounts, transformPositions, uid, validateSetUpdate } from '../domain';
import type { DrillSet, FormationKind, FormationOptions, Performer, Point, Project, Section } from '../types';
import type { Dialog, EditorState, SessionSlice } from './state';
import { canEditPositions } from './editMode';

export interface CommandArguments {
  'project.update': Partial<Pick<Project, 'title' | 'ensemble' | 'audioOffsetSeconds'>> & { preset?: Project['field']['preset'] };
  'project.load': { project: Project };
  'history.undo': undefined; 'history.redo': undefined;
  'set.update': { index: number; update: Partial<Omit<DrillSet, 'id' | 'positions'>> };
  'set.add': { index: number }; 'set.remove': { index: number }; 'set.reorder': { index: number; direction: -1 | 1 };
  'performers.add': { performers: Performer[] }; 'performers.remove': { ids: string[] };
  'performer.update': { id: string; update: Partial<Pick<Performer, 'name' | 'sectionId'>> };
  'section.add': undefined; 'section.update': { id: string; update: Partial<Pick<Section, 'name' | 'color'>> };
  'positions.move': { index: number; updates: Record<string, Point> };
  'selection.transform': { index: number; ids: string[]; options: { dx?: number; dy?: number; rotation?: number; scale?: number } };
  'formation.apply': { index: number; ids: string[]; kind: FormationKind; options: FormationOptions };
  'selection.all': undefined; 'selection.clear': undefined; 'set.select': { index: number };
  'playback.toggle': undefined; 'playback.scrub': { count: number }; 'tool.select': { tool: 'select' | 'pan' };
  'dialog.open': { dialog: Dialog };
  'file.new': undefined; 'file.open': undefined; 'file.save': undefined; 'file.save-as': undefined;
  'file.export': undefined; 'help.open': undefined;
}
export type CommandId = keyof CommandArguments;
export type ExternalCommandId = 'file.open' | 'file.save' | 'file.save-as';
export interface CommandContext {
  getState: () => EditorState;
  edit: (change: (project: Project) => Project) => void;
  load: (project: Project) => void;
  history: (direction: 'undo' | 'redo') => void;
  patch: <S extends SessionSlice>(slice: S, update: Partial<EditorState[S]>) => void;
  external: (id: ExternalCommandId) => void | Promise<void>;
}
export interface CommandDefinition<I extends CommandId> {
  id: I; name: string; description: string; arguments: Readonly<Record<string, string>>; shortcut?: string;
  enabled: (state: EditorState, args: CommandArguments[I]) => boolean;
  execute: (context: CommandContext, args: CommandArguments[I]) => void | Promise<void>;
}
const define = <I extends CommandId>(definition: CommandDefinition<I>) => definition;
const always = () => true;
const editable = canEditPositions;
const setExists = (state: EditorState, index: number) => Number.isInteger(index) && index >= 0 && index < state.project.present.sets.length;
const selectSet = (context: CommandContext, index: number) => {
  const project = context.getState().project.present;
  const next = Math.max(0, Math.min(project.sets.length - 1, index));
  context.patch('selection', { activeIndex: next }); context.patch('playback', { playing: false, count: setStartCount(project, next) });
};

export const commandRegistry = {
  'project.update': define({ id: 'project.update', name: 'Update production', description: 'Edit production metadata, field markings or audio synchronization.', arguments: { title: 'string?', ensemble: 'string?', audioOffsetSeconds: 'number?', preset: 'college | high-school?' }, enabled: always,
    execute: (c, { preset, ...update }) => c.edit(p => ({ ...p, ...update, field: preset ? { ...p.field, preset } : p.field })) }),
  'project.load': define({ id: 'project.load', name: 'Load production', description: 'Replace the production and reset edit history.', arguments: { project: 'Project v1' }, enabled: always, execute: (c, a) => c.load(a.project) }),
  'history.undo': define({ id: 'history.undo', name: 'Undo', description: 'Restore the previous project edit.', arguments: {}, shortcut: 'Ctrl / ⌘ Z', enabled: s => s.project.past.length > 0, execute: c => c.history('undo') }),
  'history.redo': define({ id: 'history.redo', name: 'Redo', description: 'Restore an undone project edit.', arguments: {}, shortcut: 'Ctrl / ⌘ Shift Z', enabled: s => s.project.future.length > 0, execute: c => c.history('redo') }),
  'set.update': define({ id: 'set.update', name: 'Edit set properties', description: 'Update set name, counts, tempo, transition or rehearsal notes.', arguments: { index: 'integer', update: 'set properties' }, enabled: (s, a) => setExists(s, a.index), execute: (c, a) => {
    validateSetUpdate(a.update, a.index);
    const wasAtSet = Math.abs(c.getState().playback.count - setStartCount(c.getState().project.present, a.index)) < 0.001;
    c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, ...a.update } : set) }));
    if (a.update.counts !== undefined && wasAtSet) c.patch('playback', { count: setStartCount(c.getState().project.present, a.index) });
  } }),
  'set.add': define({ id: 'set.add', name: 'Add set', description: 'Copy the current shape into a new 32-count set.', arguments: { index: 'integer' }, enabled: (s, a) => setExists(s, a.index) && s.project.present.sets.length < PROJECT_LIMITS.sets, execute: (c, a) => {
    c.edit(p => { const set = { ...p.sets[a.index], id: uid(), name: `Set ${p.sets.length + 1}`, counts: 32, positions: structuredClone(p.sets[a.index].positions), notes: '' }; return { ...p, sets: [...p.sets.slice(0, a.index + 1), set, ...p.sets.slice(a.index + 1)] }; }); selectSet(c, a.index + 1);
  } }),
  'set.remove': define({ id: 'set.remove', name: 'Delete set', description: 'Remove a set and connect its neighbors.', arguments: { index: 'integer' }, enabled: (s, a) => setExists(s, a.index) && s.project.present.sets.length > 1, execute: (c, a) => { c.edit(p => ({ ...p, sets: p.sets.filter((_, i) => i !== a.index).map((set, i) => i === 0 ? { ...set, counts: 0 } : set) })); selectSet(c, Math.max(0, a.index - 1)); c.patch('ui', { dialog: null }); } }),
  'set.reorder': define({ id: 'set.reorder', name: 'Move set', description: 'Move a set earlier or later in the show.', arguments: { index: 'integer', direction: '-1 | 1' }, enabled: (s, a) => setExists(s, a.index) && setExists(s, a.index + a.direction), execute: (c, a) => { c.edit(p => { const sets = [...p.sets]; const target = a.index + a.direction; [sets[a.index], sets[target]] = [sets[target], sets[a.index]]; return { ...p, sets: sets.map((set, i) => ({ ...set, counts: i === 0 ? 0 : set.counts || 32 })) }; }); selectSet(c, a.index + a.direction); } }),
  'performers.add': define({ id: 'performers.add', name: 'Add performers', description: 'Add roster members and starting positions to every set.', arguments: { performers: 'Performer[]' }, enabled: (s, a) => a.performers.length > 0 && s.project.present.performers.length + a.performers.length <= PROJECT_LIMITS.performers, execute: (c, a) => { c.edit(p => { const start = p.performers.length; return { ...p, performers: [...p.performers, ...a.performers], sets: p.sets.map(set => ({ ...set, positions: { ...set.positions, ...Object.fromEntries(a.performers.map((performer, i) => [performer.id, { x: 5 + ((start + i) % 40) * 2.3, y: Math.max(1, p.field.height - 3 - Math.floor((start + i) / 40) * 2.3) }])) } })) }; }); c.patch('selection', { selectedIds: a.performers.map(p => p.id) }); c.patch('ui', { dialog: null }); } }),
  'performers.remove': define({ id: 'performers.remove', name: 'Remove performers', description: 'Remove roster members and their positions in every set.', arguments: { ids: 'string[]' }, enabled: (s, a) => a.ids.some(id => s.project.present.performers.some(p => p.id === id)), execute: (c, a) => { c.edit(p => ({ ...p, performers: p.performers.filter(person => !a.ids.includes(person.id)), sets: p.sets.map(set => ({ ...set, positions: Object.fromEntries(Object.entries(set.positions).filter(([id]) => !a.ids.includes(id))) })) })); c.patch('selection', { selectedIds: [] }); c.patch('ui', { dialog: null }); } }),
  'performer.update': define({ id: 'performer.update', name: 'Edit performer', description: 'Update a performer name or section across the show.', arguments: { id: 'string', update: 'name? | sectionId?' }, enabled: (s, a) => s.project.present.performers.some(p => p.id === a.id), execute: (c, a) => c.edit(p => ({ ...p, performers: p.performers.map(person => person.id === a.id ? { ...person, ...a.update } : person) })) }),
  'section.add': define({ id: 'section.add', name: 'Add section', description: 'Add an ensemble section.', arguments: {}, enabled: s => s.project.present.sections.length < PROJECT_LIMITS.sections, execute: c => c.edit(p => ({ ...p, sections: [...p.sections, { id: uid(), name: `Section ${p.sections.length + 1}`, color: '#a6cce2' }] })) }),
  'section.update': define({ id: 'section.update', name: 'Edit section', description: 'Update section name or color.', arguments: { id: 'string', update: 'name? | color?' }, enabled: (s, a) => s.project.present.sections.some(section => section.id === a.id), execute: (c, a) => c.edit(p => ({ ...p, sections: p.sections.map(section => section.id === a.id ? { ...section, ...a.update } : section) })) }),
  'positions.move': define({ id: 'positions.move', name: 'Move performers', description: 'Set performer coordinates on the active editable set.', arguments: { index: 'integer', updates: 'Record<performerId, Point>' }, enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex, execute: (c, a) => c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: { ...set.positions, ...a.updates } } : set) })) }),
  'selection.transform': define({ id: 'selection.transform', name: 'Transform selection', description: 'Move, rotate or scale selected performers within the field.', arguments: { index: 'integer', ids: 'string[]', options: 'dx? | dy? | rotation? | scale?' }, shortcut: 'Arrow / Shift + Arrow', enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex && a.ids.length > 0, execute: (c, a) => c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: transformPositions(set.positions, a.ids, a.options, p.field) } : set) })) }),
  'formation.apply': define({ id: 'formation.apply', name: 'Apply formation', description: 'Shape selected performers or the full cast into a fitted formation.', arguments: { index: 'integer', ids: 'string[]', kind: 'FormationKind', options: 'FormationOptions' }, enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex && a.ids.length > 0, execute: (c, a) => c.edit(p => { const points = fitFormationToField(generateFormation(a.kind, a.ids.length, a.options), p.field); const positions = Object.fromEntries(a.ids.map((id, i) => [id, { x: Math.max(0, Math.min(p.field.width, points[i].x)), y: Math.max(0, Math.min(p.field.height, points[i].y)) }])); return { ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: { ...set.positions, ...positions } } : set) }; }) }),
  'selection.all': define({ id: 'selection.all', name: 'Select all performers', description: 'Select the full ensemble.', arguments: {}, shortcut: 'Ctrl / ⌘ A', enabled: s => !s.ui.dialog, execute: c => c.patch('selection', { selectedIds: c.getState().project.present.performers.map(p => p.id) }) }),
  'selection.clear': define({ id: 'selection.clear', name: 'Clear selection', description: 'Clear selected performers and dismiss the project menu.', arguments: {}, shortcut: 'Esc', enabled: always, execute: c => { c.patch('selection', { selectedIds: [] }); c.patch('ui', { menu: false }); } }),
  'set.select': define({ id: 'set.select', name: 'Go to set', description: 'Stop playback and arrive at a set for editing.', arguments: { index: 'integer' }, shortcut: '[ / ]', enabled: (_s, a) => Number.isInteger(a.index), execute: (c, a) => selectSet(c, a.index) }),
  'playback.toggle': define({ id: 'playback.toggle', name: 'Play / pause', description: 'Rehearse or pause the production.', arguments: {}, shortcut: 'Space', enabled: s => totalCounts(s.project.present) > 0, execute: c => { const s = c.getState(); c.patch('playback', { playing: !s.playback.playing, count: s.playback.count >= totalCounts(s.project.present) ? 0 : s.playback.count }); } }),
  'playback.scrub': define({ id: 'playback.scrub', name: 'Seek count', description: 'Stop playback and inspect a count.', arguments: { count: 'number' }, enabled: (_s, a) => Number.isFinite(a.count), execute: (c, a) => { const p = c.getState().project.present; const count = Math.max(0, Math.min(totalCounts(p), a.count)); c.patch('playback', { playing: false, count }); c.patch('selection', { activeIndex: sampleProject(p, count).setIndex }); } }),
  'tool.select': define({ id: 'tool.select', name: 'Select / pan', description: 'Choose the field interaction tool.', arguments: { tool: 'select | pan' }, shortcut: 'V / H', enabled: always, execute: (c, a) => c.patch('ui', { tool: a.tool }) }),
  'dialog.open': define({ id: 'dialog.open', name: 'Open dialog', description: 'Open an editor dialog and stop playback.', arguments: { dialog: 'Dialog' }, enabled: always, execute: (c, a) => {
    if (a.dialog) c.patch('playback', { playing: false });
    if (a.dialog === 'add-cast') { const s = c.getState(); c.patch('ui', { castAmount: Math.max(1, Math.min(s.ui.castAmount, PROJECT_LIMITS.performers - s.project.present.performers.length)) }); }
    c.patch('ui', { dialog: a.dialog });
  } }),
  'file.new': define({ id: 'file.new', name: 'New production', description: 'Choose a blank production or demo.', arguments: {}, shortcut: 'Ctrl / ⌘ N', enabled: always, execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'new', menu: false }); } }),
  'file.open': define({ id: 'file.open', name: 'Open production', description: 'Open a saved .squid project.', arguments: {}, shortcut: 'Ctrl / ⌘ O', enabled: always, execute: c => c.external('file.open') }),
  'file.save': define({ id: 'file.save', name: 'Save production', description: 'Save an editable .squid file.', arguments: {}, shortcut: 'Ctrl / ⌘ S', enabled: always, execute: c => c.external('file.save') }),
  'file.save-as': define({ id: 'file.save-as', name: 'Save production as', description: 'Choose a new destination for the project.', arguments: {}, shortcut: 'Ctrl / ⌘ Shift S', enabled: always, execute: c => c.external('file.save-as') }),
  'file.export': define({ id: 'file.export', name: 'Export rehearsal packet', description: 'Choose field charts, coordinates, CSV or SVG.', arguments: {}, enabled: always, execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'export' }); } }),
  'help.open': define({ id: 'help.open', name: 'Guide & shortcuts', description: 'Open workflow help and command shortcuts.', arguments: {}, enabled: always, execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'help', menu: false }); } }),
} satisfies { [I in CommandId]: CommandDefinition<I> };

export const commandMetadata = Object.values(commandRegistry).map(({ id, name, description, arguments: args, shortcut }) => ({ id, name, description, arguments: args, shortcut }));
export const shortcutCommands = commandMetadata.filter(command => command.shortcut);
export function executeCommand<I extends CommandId>(context: CommandContext, id: I, args: CommandArguments[I]): boolean | Promise<boolean> {
  const definition = commandRegistry[id] as unknown as CommandDefinition<I>;
  if (!definition.enabled(context.getState(), args)) return false;
  const result = definition.execute(context, args);
  return result instanceof Promise ? result.then(() => true) : true;
}
