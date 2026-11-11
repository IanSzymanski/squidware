import { commandRegistry, type CommandArguments, type CommandDefinition, type CommandId } from './commands';
import { PROJECT_LIMITS } from '../domain';
import { canEditPositions, isAtActiveSet } from './editMode';
import { currentCoordinateResult } from './coordinateSession';
import { currentFormationResult } from './formationSession';
import { currentSpacingResult } from './spacingSession';
import { currentTransformResult } from './transformSession';
import type { EditorState } from './state';
import { drillPlan, isDrillPhrase } from './drillCommands';
import { openingMoveNote } from './setList';

export type CommandInvocation = { [I in CommandId]: { id: I; args: CommandArguments[I] } }[CommandId];
export interface PaletteEntry { key: string; name: string; description: string; keywords: string; invocation: CommandInvocation; disabledReason: string | null }
export function commandUnavailable(state: EditorState, invocation: CommandInvocation): string | null {
  const { id, args } = invocation;
  if (state.ui.pendingDraft || state.project.transactionName || state.ui.dialog) return 'Finish or cancel the current input, gesture or dialog first.';
  if (state.fileSession.fileOperation && id.startsWith('file.')) return 'Wait for the current file operation to finish.';
  if (id === 'dialog.open' && args.dialog === 'remove-cast' && !state.selection.selectedIds.length) return 'Select performers to remove first.';
  if (id === 'dialog.open' && args.dialog === 'remove-set' && state.project.present.sets.length <= 1) return 'Keep at least one set in the production.';
  const previews = state.ui.transformPreview || state.ui.formationPreview || state.ui.spacingPreview || state.ui.coordinatePreview || state.ui.selectionPreview;
  if (previews && !/\.(apply|cancel)$/.test(id) && !['live.redistribute', 'palette.open', 'tool.box', 'tool.pan', 'display.paths', 'display.labels', 'field.zoom-in', 'field.zoom-out', 'field.fit', 'view.popout', 'view.popout-close'].includes(id)) return 'Apply or cancel the current preview first.';
  if (['selection.move-controls', 'transform.preview', 'transform.mirror', 'formation.preview', 'spacing.preview', 'coordinates.preview'].includes(id)) {
    if (!canEditPositions(state)) return state.playback.playing ? 'Pause playback at a set before editing positions.' : !isAtActiveSet(state) ? 'Return to a set before editing positions.' : 'Finish or cancel the current preview first.';
    if (state.selection.selectedIds.length < (id === 'spacing.preview' ? 2 : 1)) return id === 'spacing.preview' ? 'Select at least two performers on this set.' : 'Select performers on this set first.';
  }
  const definition = commandRegistry[id] as unknown as CommandDefinition<CommandId>;
  if (definition.enabled(state, args)) return null;
  if (id.endsWith('.cancel')) return 'There is no matching preview to cancel.';
  if (id.endsWith('.apply')) {
    const result = id === 'coordinates.apply' ? currentCoordinateResult(state) : id === 'formation.apply' ? currentFormationResult(state) : id === 'spacing.apply' ? currentSpacingResult(state) : id === 'transform.apply' ? currentTransformResult(state) : null;
    return result?.error ?? (result ? 'The preview matches the current positions.' : 'Open a matching preview first.');
  }
  if (id === 'history.undo') return 'There are no earlier edits to undo.';
  if (id === 'history.redo') return 'There are no undone edits to restore.';
  if (id === 'path.operations-open') return 'Pause at a set in a production with at least one move. Finish other input first.';
  if ((id==='path.open'||id==='path.draw-open'||id==='schedule.open')&&state.project.present.moves[state.selection.activeIndex-1]?.groupMotions?.some(g=>g.members.includes(state.selection.selectedIds[0])))return 'Edit Group route movement or remove this member there before editing individual travel.';
  if(id==='group.open')return 'Pause at an arrival set in 2D and select at least two members, or choose a saved group.';
  if (id === 'path.open' || id === 'path.draw-open' || id === 'schedule.open') return 'Pause at an arrival set and select exactly one performer. Finish other input first.';
  if (id === 'set.split-open') {
    if (state.project.present.sets.length >= PROJECT_LIMITS.sets) return 'The production has reached its set limit.';
    return 'Choose a transition with at least two counts.';
  }
  if (id === 'set.previous') return 'This is the first set.';
  if (id === 'set.next') return 'This is the last set.';
  if (['set.new', 'set.duplicate', 'set.insert-before', 'set.hold'].includes(id)) return 'The production has reached its set limit.';
  if (id === 'set.reorder') return 'The current set is already at this end of the set list.';
  if (id === 'set.move-to') return state.project.present.sets[args.target]?.id === args.id ? `This set is already at position ${args.target + 1}.` : 'Pause playback and finish other input before reordering sets.';
  if (id === 'set.add') return 'The production has reached its set limit.';
  if (id === 'performers.add-dialog') return 'The production has reached its performer limit.';
  if (id === 'playback.toggle') return 'Add a second set with move counts before rehearsing.';
  if (id.startsWith('playback.count-')) return 'The playhead is already at this end of the show.';
  if (id.startsWith('field.')) return state.ui.view !== '2d' || state.ui.workspace !== 'design' ? 'Open the 2D field to use field zoom.' : 'The field is already at this zoom limit.';
  if (id === 'tool.lasso') return 'Pause at a set in the 2D field before drawing a lasso.';
  if (id === 'selection.invert') return 'Add performers before inverting the selection.';
  if (id === 'selection.section') return 'This section has no performers to select.';
  if (id === 'group.select') return 'This saved group has no performers to select.';
  if (id === 'layout.focus') return 'Open the Design workspace before focusing the field.';
  if (id === 'view.popout') return 'The 3D window is available in the desktop app.';
  if (id === 'view.popout-close') return 'The 3D window is not open.';
  return 'This action is unavailable in the current editing context.';
}
/** User commands and concrete variants. Parameter entry remains in its shared editor. */
export function paletteEntries(state: EditorState): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  function add<I extends CommandId>(id: I, args: CommandArguments[I], name?: string, key = id as string, description = commandRegistry[id].description) {
    const invocation = { id, args } as CommandInvocation;
    const keywords = id === 'view.popout' ? 'pop out popout detach second monitor display separate 3d preview window' : id === 'selection.tools' ? 'create rename update remove saved groups radius nearest polygon' : id === 'cast.show' ? 'edit performer name section roster' : id === 'preferences.open' ? 'rebind keyboard bindings shortcuts theme contrast scale panel layout increments hints tips' : id === 'dialog.open' && key === 'dialog-settings' ? 'edit production title ensemble field markings section color audio offset' : '';
    entries.push({ key, name: name ?? commandRegistry[id].name, description, keywords, invocation, disabledReason: commandUnavailable(state, invocation) });
  }
  // The browser build has no separate 3D window, so its commands stay hidden there.
  const hidden = new Set<CommandId>(['palette.open', 'section.add', 'selection.close', ...(state.ui.popout3d === 'unavailable' ? ['view.popout', 'view.popout-close'] as const : [])]);
  for (const definition of Object.values(commandRegistry)) if (!Object.keys(definition.arguments).length && !hidden.has(definition.id)) add(definition.id, undefined);
  add('coordinates.preview', {});
  for (const direction of [-1, 1] as const) add('set.reorder', { index: state.selection.activeIndex, direction }, direction === -1 ? 'Move current set earlier' : 'Move current set later', `reorder-${direction}`);
  const current = state.project.present.sets[state.selection.activeIndex];
  // The current position stays listed (unavailable) so typing it never falls through to a longer number such as 10 or 120.
  for (let target = 0; target < state.project.present.sets.length; target++) {
    add('set.move-to', { id: current.id, target, revision: state.project.revision, epoch: state.ui.projectEpoch }, `Move current set to position ${target + 1}`, `move-to-${target}`,
      `${commandRegistry['set.move-to'].description}${openingMoveNote(state.selection.activeIndex, target)}`);
  }
  add('group.open',{},'Group route movement','group-movement-new');
  for(const group of state.project.present.moves[state.selection.activeIndex-1]?.groupMotions??[])add('group.open',{id:group.id},`Edit group movement: ${group.name}`,`group-movement-${group.id}`);
  add('transform.preview', {});
  add('view.select', { view: '2d' }, 'Open 2D field', 'view-2d');
  add('view.select', { view: '3d' }, 'Open 3D preview', 'view-3d');
  for (const [preset,name] of [['perspective','Perspective camera'],['front','Front camera'],['top','Overhead camera']] as const) add('view.camera',{preset},name,`camera-${preset}`);
  add('workspace.show', { workspace: 'production' }, 'Production sheet');
  add('transform.preview', { operation: 'front-back' }, 'Mirror front / back', 'mirror-front-back');
  for (const kind of ['line', 'arc', 'circle', 'block', 'curve'] as const) add('formation.preview', { kind }, `Preview ${kind} formation`, `formation-${kind}`);
  add('formation.bezier',{wave:false},'Preview Bézier curve formation','formation-bezier-curve');
  add('formation.bezier',{wave:true},'Preview Bézier wave formation','formation-bezier-wave');
  for (const shape of state.project.present.sets[state.selection.activeIndex].liveFormations ?? []) {
    add('live.edit',{id:shape.id},`Edit live formation: ${shape.name}`,`live-edit-${shape.id}`);
    add('live.detach',{id:shape.id},`Detach live formation: ${shape.name}`,`live-detach-${shape.id}`);
  }
  for (const preset of ['write', 'review', 'rehearse'] as const) add('layout.preset', { preset }, `${preset[0].toUpperCase()}${preset.slice(1)} workspace preset`, `layout-${preset}`);
  for (const [mode, name] of [['panel', 'Show Cast beside field'], ['table', 'Edit Cast table'], ['closed', 'Show Design workspace']] as const) add('cast.show', { mode }, name, `cast-${mode}`);
  for (const [dialog, name] of [['package', 'Export portable production with audio'], ['metronome', 'Metronome and count-in'], ['settings', 'Production settings'], ['snapping', 'Grid and snapping'], ['remove-cast', 'Remove selected performers'], ['remove-set', 'Delete current set']] as const) {
    add('dialog.open', { dialog }, name, `dialog-${dialog}`);
  }
  state.project.present.sets.forEach((set, index) => add('set.select', { index }, `Go to set ${index + 1}: ${set.name}`, `set-${set.id}`));
  state.project.present.sections.forEach(section => add('selection.section', { id: section.id }, `Select section: ${section.name}`, `section-${section.id}`));
  state.project.present.selectionGroups?.forEach(group => add('group.select', { id: group.id }, `Select saved group: ${group.name}`, `group-${group.id}`));
  return entries;
}
export function searchPalette(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const q = query.toLowerCase().trim(), terms = q.split(/\s+/).filter(Boolean);
  // An exact name outranks longer names that merely start with it ("position 1" before "position 10").
  const rank = (entry: PaletteEntry) => entry.name.toLowerCase() === q ? 2 : entry.name.toLowerCase().startsWith(q) ? 1 : 0;
  return entries.filter(entry => terms.every(term => `${entry.name} ${entry.description} ${entry.keywords} ${entry.invocation.id}`.toLowerCase().includes(term)))
    .sort((a, b) => rank(b) - rank(a) || (!terms.length ? Number(!!a.disabledReason) - Number(!!b.disabledReason) : 0) || a.name.localeCompare(b.name));
}
/** Valid drill phrases take precedence. Otherwise keep matching action names searchable. */
export function paletteQuery(state: EditorState, query: string) {
  const matches = searchPalette(paletteEntries(state), query);
  const resolved = isDrillPhrase(query) ? drillPlan(state, query) : null;
  const phrase = !!resolved && (!!resolved.plan || !matches.length);
  return { phrase, resolved, entries: phrase ? [] : matches };
}
