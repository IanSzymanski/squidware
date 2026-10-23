import { PROJECT_LIMITS, sampleTimeline, setStartCount, totalCounts, transformPositions, uid, validateSetUpdate } from '../domain';
import type { SetPropertyUpdate, FormationKind, FormationOptions, Performer, Point, Project, Section } from '../types';
import type { Dialog, EditorState, SessionSlice, Workspace } from './state';
import { createPicture, reconnectSets, updateSetProperties, type SetCreationKind, type SetCreationOptions } from './projectEdits';
import { canEditPositions } from './editMode';
import { assertCanReplace } from './fileSession';
import { defaultTransform, type ExactTransform, type TransformOperation } from '../transforms';
import { currentTransformResult, transformSessionCurrent } from './transformSession';
import { currentFormationResult, formationSessionCurrent } from './formationSession';
import { formationAssignmentOrder, formationCenter } from '../formationAssignment';
import { DEFAULT_SNAPPING, moveSelection, validateSnapSettings, type SnapSettings } from '../snapping';
import { isNudgeKey, nudgeDelta, type NudgeRequest } from '../editIncrements';
import { defaultSpacing, type SpacingOptions } from '../spacing';
import { currentSpacingResult, spacingSessionCurrent } from './spacingSession';
import { validateCoordinateEntryOptions, type CoordinateEntryOptions } from '../drillEntry';
import { currentCoordinateResult, coordinateSessionCurrent } from './coordinateSession';
import { validateWorkspaceLayout, workspacePreset, type WorkspaceLayout, type WorkspacePreset } from '../workspaceLayout';
import type { SelectionSpec } from '../selectionTools';
import { rehearsalCommands } from './rehearsalCommands';
import { rehearsalBounds } from '../rehearsal';
import type { RehearsalPassage } from '../types';
import { selectionCommands } from './selectionCommands';
import { drillPlan } from './drillCommands';
import { shortcutIds } from '../shortcuts';

export interface CommandArguments {
  'rehearsal.open': undefined; 'rehearsal.save': { passage: RehearsalPassage };
  'rehearsal.remove': { id: string }; 'rehearsal.activate': { id: string }; 'rehearsal.clear': undefined;
  'palette.open': undefined; 'preferences.open': undefined; 'drill.preview': { text: string };
  'tool.box': undefined; 'tool.pan': undefined; 'tool.lasso': undefined;
  'performers.add-dialog': undefined; 'set.new': undefined; 'set.duplicate': undefined; 'set.insert-before': undefined; 'set.hold': undefined; 'set.previous': undefined; 'set.next': undefined;
  'transform.mirror': undefined; 'view.toggle': undefined; 'display.paths': undefined; 'display.labels': undefined;
  'field.zoom-in': undefined; 'field.zoom-out': undefined; 'field.fit': undefined;
  'view.select': { view: '2d' | '3d' }; 'workspace.show': { workspace: Workspace };
  'playback.count-previous': undefined; 'playback.count-next': undefined;
  'selection.tools': undefined; 'selection.close': undefined;
  'selection.section': { id: string; additive?: boolean }; 'selection.invert': undefined;
  'selection.preview': { spec: SelectionSpec; additive?: boolean };
  'selection.review': { ids: string[]; additive: boolean }; 'selection.apply': undefined; 'selection.cancel': undefined;
  'group.create': { name: string }; 'group.rename': { id: string; name: string };
  'group.update': { id: string }; 'group.remove': { id: string }; 'group.select': { id: string; additive?: boolean };
  'layout.update': { update: Partial<WorkspaceLayout> };
  'layout.preset': { preset: WorkspacePreset };
  'layout.focus': undefined;
  'cast.show': { mode: 'panel' | 'table' | 'closed' };
  'project.update': Partial<Pick<Project, 'title' | 'ensemble' | 'audioOffsetSeconds'>> & { preset?: Project['field']['preset'] };
  'project.load': { project: Project };
  'history.undo': undefined; 'history.redo': undefined; 'history.open': undefined;
  'set.update': { index: number; update: SetPropertyUpdate };
  'set.create': { index: number; kind: SetCreationKind } & SetCreationOptions;
  'set.add': { index: number }; 'set.remove': { index: number }; 'set.reorder': { index: number; direction: -1 | 1 };
  'performers.add': { performers: Performer[] }; 'performers.remove': { ids: string[] };
  'performer.update': { id: string; update: Partial<Pick<Performer, 'name' | 'sectionId'>> };
  'section.add': undefined; 'section.update': { id: string; update: Partial<Pick<Section, 'name' | 'color'>> };
  'positions.move': { index: number; updates: Record<string, Point> };
  'positions.place': { index: number; id: string; axis: 'x' | 'y'; value: number };
  'snapping.update': { settings: SnapSettings };
  'selection.transform': { index: number; ids: string[]; options: { dx?: number; dy?: number; rotation?: number; scale?: number } };
  'selection.nudge': NudgeRequest;
  'selection.increment': { operation: 'rotate' | 'scale'; direction: -1 | 1 };
  'transform.preview': { operation?: TransformOperation; angle?: number; scale?: number };
  'transform.update': { options: ExactTransform };
  'transform.apply': undefined; 'transform.cancel': undefined;
  'spacing.preview': undefined; 'spacing.update': { options: SpacingOptions };
  'spacing.apply': undefined; 'spacing.cancel': undefined;
  'coordinates.preview': Partial<CoordinateEntryOptions>;
  'coordinates.update': { options: CoordinateEntryOptions };
  'coordinates.apply': undefined; 'coordinates.cancel': undefined;
  'formation.preview': { kind?: FormationKind };
  'formation.update': { options: FormationOptions };
  'formation.apply': undefined; 'formation.cancel': undefined;
  'selection.all': undefined; 'selection.clear': undefined; 'set.select': { index: number };
  'playback.toggle': undefined; 'playback.scrub': { count: number }; 'tool.select': { tool: 'select' | 'pan' | 'lasso' };
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
  id: I; name: string; description: string; arguments: Readonly<Record<string, string>>;
  enabled: (state: EditorState, args: CommandArguments[I]) => boolean;
  execute: (context: CommandContext, args: CommandArguments[I]) => void | Promise<void>;
}
const define = <I extends CommandId>(definition: CommandDefinition<I>) => definition;
const simple = <I extends CommandId>(id: I, name: string, description: string, enabled: (s: EditorState) => boolean, execute: (c: CommandContext) => void) => define({ id, name, description, arguments: {}, enabled, execute });
const always = () => true;
const idle = (s: EditorState) => !s.ui.dialog && !s.ui.pendingDraft && !s.project.transactionName;
const canNavigate = (s: EditorState) => idle(s) && !s.ui.selectionPreview && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview;
const fieldView = (s: EditorState) => idle(s) && s.ui.workspace === 'design' && s.ui.view === '2d';
export const canChangeLayout = (s: EditorState) => !s.ui.selectionPreview && !s.ui.dialog && !s.ui.pendingDraft && !s.project.transactionName && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview;
const showDialog = (context: CommandContext, dialog: Dialog) => {
  const state = context.getState();
  if (state.ui.dialog !== dialog && state.ui.pendingDraft) throw new Error('Finish or cancel the pending edit before changing dialogs.');
  if (dialog) context.patch('playback', { playing: false });
  context.patch('ui', { dialog });
};
const editable = canEditPositions;
const canIncrement = (s: EditorState) => editable(s) && !s.ui.dialog && !s.project.transactionName && !s.ui.pendingDraft && s.selection.selectedIds.length > 0;
function beginTransform(c: CommandContext, args: CommandArguments['transform.preview']) {
  const s = c.getState();
  c.patch('ui', { workspace: 'design', view: '2d', transformPreview: { revision: s.project.revision, setId: s.project.present.sets[s.selection.activeIndex].id, ids: [...s.selection.selectedIds], options: { ...defaultTransform(), operation: args.operation ?? 'rotate-scale', angle: args.angle ?? 0, scale: args.scale ?? 1 } } });
}
const setExists = (state: EditorState, index: number) => Number.isInteger(index) && index >= 0 && index < state.project.present.sets.length;
const selectSet = (context: CommandContext, index: number) => {
  const project = context.getState().project.present;
  const next = Math.max(0, Math.min(project.sets.length - 1, index));
  context.patch('playback', { rehearsalId: null });
  context.patch('selection', { activeIndex: next }); context.patch('playback', { playing: false, count: setStartCount(project, next), seekVersion: context.getState().playback.seekVersion + 1 });
};

const canOpenSetCreation = (s: EditorState) => canNavigate(s) && s.project.present.sets.length < PROJECT_LIMITS.sets;
function openSetCreation(c: CommandContext, kind: SetCreationKind) {
  c.patch('ui', { setCreationKind: kind }); showDialog(c, 'set-create');
}
function applySetCreation(c: CommandContext, index: number, kind: SetCreationKind, options: SetCreationOptions = {}) {
  c.edit(p => createPicture(p, index, kind, c.getState().preferences.value.newSetCounts, options));
  selectSet(c, kind === 'insert-before' ? index : index + 1);
  c.patch('ui', { dialog: null });
}

export const commandRegistry = {
  ...selectionCommands,
  ...rehearsalCommands,
  'palette.open': simple('palette.open', 'Command palette', 'Search commands and preview drill phrases. Escape returns to the editor.', idle, c => { c.patch('ui', { paletteOpen: true, menu: false }); c.patch('playback', { playing: false }); }),
  'preferences.open': simple('preferences.open', 'Preferences', 'Change personal display, editing and keyboard shortcuts on this device.', idle, c => showDialog(c, 'preferences')),
  'drill.preview': define({ id: 'drill.preview', name: 'Preview drill phrase', description: 'Preview a relative move, mirror, interval or labelled performer coordinate before Apply.', arguments: { text: 'complete drill phrase' },
    enabled: (s, a) => !!a && !!drillPlan(s, a.text).plan,
    execute: (c, a) => { const s = c.getState(); const plan = drillPlan(s, a.text).plan!; const base = { revision: s.project.revision, setId: s.project.present.sets[s.selection.activeIndex].id, ids: plan.ids };
      c.patch('selection', { selectedIds: plan.ids });
      const command = plan.command;
      c.patch('ui', { workspace: 'design', view: '2d', paletteOpen: false,
        ...(command.kind === 'coordinates' ? { coordinatePreview: { ...base, options: command.options } } : command.kind === 'mirror' ? { transformPreview: { ...base, options: command.options } } : { spacingPreview: { ...base, options: command.options } }) });
    } }),
  'tool.box': simple('tool.box', 'Select performers', 'Choose box selection and move selected dots.', idle, c => { void executeCommand(c, 'tool.select', { tool: 'select' }); }),
  'tool.pan': simple('tool.pan', 'Pan field', 'Move the viewport without moving performers, including during a field preview.', idle, c => { void executeCommand(c, 'tool.select', { tool: 'pan' }); }),
  'tool.lasso': simple('tool.lasso', 'Lasso selection', 'Draw a freehand boundary and review the selected performers.', s => canNavigate(s) && editable(s) && s.ui.view === '2d', c => { void executeCommand(c, 'tool.select', { tool: 'lasso' }); }),
  'performers.add-dialog': simple('performers.add-dialog', 'Add performers', 'Choose a section, label prefix and number of new performers.', s => canNavigate(s) && s.project.present.performers.length < PROJECT_LIMITS.performers, c => { void executeCommand(c, 'dialog.open', { dialog: 'add-cast' }); }),
  'set.new': simple('set.new', 'New set', 'Review a new set after the current set: fresh staging grid, blank notes, default counts and constant speed.', canOpenSetCreation, c => openSetCreation(c, 'new')),
  'set.duplicate': simple('set.duplicate', 'Duplicate current set', 'Review a copy after this set: positions, notes and incoming timing. The new picture starts with a hold; incoming travel is not replayed.', canOpenSetCreation, c => openSetCreation(c, 'duplicate')),
  'set.insert-before': simple('set.insert-before', 'Insert before current set', 'Review a set before this one, carrying the preceding positions and keeping this set’s arrival timing. Before opening, add a zero-count opening picture.', canOpenSetCreation, c => openSetCreation(c, 'insert-before')),
  'set.hold': simple('set.hold', 'Hold positions', 'Review a hold after this set: keep all positions for the chosen counts, blank notes and constant speed. The new picture remains editable.', canOpenSetCreation, c => openSetCreation(c, 'hold')),
  'set.previous': simple('set.previous', 'Previous set', 'Stop playback and arrive at the previous set.', s => canNavigate(s) && s.selection.activeIndex > 0, c => selectSet(c, c.getState().selection.activeIndex - 1)),
  'set.next': simple('set.next', 'Next set', 'Stop playback and arrive at the next set.', s => canNavigate(s) && s.selection.activeIndex < s.project.present.sets.length - 1, c => selectSet(c, c.getState().selection.activeIndex + 1)),
  'transform.mirror': simple('transform.mirror', 'Mirror across 50', 'Preview a physical midfield mirror on the selected performers.', canIncrement, c => beginTransform(c, { operation: 'across-50' })),
  'view.toggle': simple('view.toggle', 'Toggle 2D / 3D', 'Switch between field editing and the 3D rehearsal preview.', canNavigate, c => { const s = c.getState(); c.patch('ui', { workspace: 'design', view: s.ui.view === '2d' ? '3d' : '2d' }); }),
  'view.select': define({ id: 'view.select', name: 'Select field view', description: 'Open the 2D field or 3D rehearsal view.', arguments: { view: '2d | 3d' }, enabled: (s, a) => canNavigate(s) && !!a && ['2d', '3d'].includes(a.view), execute: (c, a) => c.patch('ui', { workspace: 'design', view: a.view }) }),
  'workspace.show': define({ id: 'workspace.show', name: 'Show workspace', description: 'Open Design, Cast or the Production sheet.', arguments: { workspace: 'design | cast | production' }, enabled: (s, a) => canNavigate(s) && !!a && ['design', 'cast', 'production'].includes(a.workspace), execute: (c, a) => c.patch('ui', { workspace: a.workspace, castPanelOpen: false }) }),
  'display.paths': simple('display.paths', 'Show previous paths', 'Toggle incoming travel paths without changing geometry.', idle, c => c.patch('ui', { showPaths: !c.getState().ui.showPaths })),
  'display.labels': simple('display.labels', 'Cycle performer labels', 'Cycle all labels, selected/focused labels and hidden labels.', idle, c => { const u = c.getState().ui; c.patch('ui', !u.showLabels ? { showLabels: true, selectionLabelsOnly: false } : !u.selectionLabelsOnly ? { selectionLabelsOnly: true } : { showLabels: false }); }),
  'field.zoom-in': simple('field.zoom-in', 'Zoom field in', 'Increase the 2D field magnification.', s => fieldView(s) && s.ui.zoom < 3, c => c.patch('ui', { zoom: Math.min(3, c.getState().ui.zoom + .2) })),
  'field.zoom-out': simple('field.zoom-out', 'Zoom field out', 'Reduce the 2D field magnification.', s => fieldView(s) && s.ui.zoom > .6, c => c.patch('ui', { zoom: Math.max(.6, c.getState().ui.zoom - .2) })),
  'field.fit': simple('field.fit', 'Fit field', 'Reset 2D zoom and pan to show the entire field.', fieldView, c => c.patch('ui', { zoom: 1, fitVersion: c.getState().ui.fitVersion + 1 })),
  'playback.count-previous': simple('playback.count-previous', 'Previous count', 'Pause and inspect the preceding count.', s => canNavigate(s) && s.playback.count > 0, c => { void executeCommand(c, 'playback.scrub', { count: c.getState().playback.count - 1 }); }),
  'playback.count-next': simple('playback.count-next', 'Next count', 'Pause and inspect the following count.', s => canNavigate(s) && s.playback.count < totalCounts(s.project.present), c => { void executeCommand(c, 'playback.scrub', { count: c.getState().playback.count + 1 }); }),
  'layout.update': define({ id: 'layout.update', name: 'Change panel layout', description: 'Resize or collapse panels on this device without changing the production.', arguments: { update: 'Partial<WorkspaceLayout>' }, enabled: (s, a) => canChangeLayout(s) || !s.ui.dialog && !!a && Object.entries(a.update).every(([key, value]) => key.endsWith('Collapsed') && value === false),
    execute: (c, a) => { const p = c.getState().preferences.value; c.patch('preferences', { value: { ...p, workspaceLayout: validateWorkspaceLayout({ ...p.workspaceLayout, ...a.update, preset: 'custom' }) } }); } }),
  'layout.preset': define({ id: 'layout.preset', name: 'Apply workspace preset', description: 'Write shows editing tools, Review expands the field, and Rehearse hides both side panels. Saved on this device.', arguments: { preset: 'write | review | rehearse' }, enabled: (s, a) => canChangeLayout(s) && !!a && ['write', 'review', 'rehearse'].includes(a.preset),
    execute: (c, a) => { const p = c.getState().preferences.value; c.patch('preferences', { value: { ...p, workspaceLayout: workspacePreset(a.preset), castPanelOpen: false } }); c.patch('ui', { workspace: 'design', castPanelOpen: false, focusMode: false }); } }),
  'layout.focus': define({ id: 'layout.focus', name: 'Focus field', description: 'Show only the field and timeline. Escape or Exit focus restores the workspace.', arguments: {}, enabled: s => s.ui.focusMode || s.ui.workspace === 'design' && canChangeLayout(s),
    execute: c => c.patch('ui', { focusMode: !c.getState().ui.focusMode, menu: false }) }),
  'cast.show': define({ id: 'cast.show', name: 'Show Cast', description: 'Dock the Cast beside the field, expand its table or return to the Inspector without changing selection.', arguments: { mode: 'panel | table | closed' },
    enabled: (s, a) => !!a && ['panel', 'table', 'closed'].includes(a.mode) && !s.ui.dialog && !s.ui.pendingDraft && !s.project.transactionName && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview,
    execute: (c, a) => { if (a.mode === 'panel') { const p = c.getState().preferences.value; c.patch('preferences', { value: { ...p, workspaceLayout: { ...p.workspaceLayout, castCollapsed: false } } }); } c.patch('ui', { workspace: a.mode === 'table' ? 'cast' : 'design', castPanelOpen: a.mode === 'panel' }); } }),
  'selection.nudge': define({ id: 'selection.nudge', name: 'Nudge selection', description: 'Move the explicit selection using the configured normal or fast increment and production snapping rules.', arguments: { key: 'ArrowLeft | ArrowRight | ArrowUp | ArrowDown', fast: 'boolean?', fieldRelative: 'boolean? (default: screen direction)' },
    enabled: (s, a) => canIncrement(s) && !!a && isNudgeKey(a.key) && (a.fast === undefined || typeof a.fast === 'boolean') && (a.fieldRelative === undefined || typeof a.fieldRelative === 'boolean'),
    execute: (c, a) => { const s = c.getState(); const delta = nudgeDelta(s.preferences.value, s.project.present, a); const index = s.selection.activeIndex;
      const updates = moveSelection(s.project.present.sets[index].positions, s.selection.selectedIds, { x: delta.dx, y: delta.dy }, s.project.present.field, s.project.present.snapping ?? DEFAULT_SNAPPING, s.ui.snap, undefined, { x: !!delta.dx, y: !!delta.dy, advance: true });
      c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === index ? { ...set, positions: { ...set.positions, ...updates } } : set) }));
    } }),
  'selection.increment': define({ id: 'selection.increment', name: 'Preview edit increment', description: 'Preview the configured rotation in degrees or scale percentage, then Apply or Cancel.', arguments: { operation: 'rotate | scale', direction: '-1 | 1' },
    enabled: (s, a) => canIncrement(s) && !!a && ['rotate', 'scale'].includes(a.operation) && [-1, 1].includes(a.direction),
    execute: (c, a) => { const p = c.getState().preferences.value; beginTransform(c, { angle: a.operation === 'rotate' ? a.direction * p.rotationStep : 0, scale: a.operation === 'scale' ? 1 + a.direction * p.scaleStep / 100 : 1 }); } }),
  'snapping.update': define({ id: 'snapping.update', name: 'Change grid and snapping', description: 'Save placement rules with this production without moving any performers.', arguments: { settings: 'SnapSettings' }, enabled: s => !s.ui.pendingDraft && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview && !s.project.transactionName,
    execute: (c, a) => { const snapping = validateSnapSettings(a.settings); c.edit(p => ({ ...p, snapping })); } }),
  'positions.place': define({ id: 'positions.place', name: 'Place performer', description: 'Place a performer using the active snap targets; the other coordinate stays unchanged.', arguments: { index: 'integer', id: 'performerId', axis: 'x | y', value: 'yards' }, enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex && !!s.project.present.sets[a.index].positions[a.id],
    execute: (c, a) => { const s = c.getState(); const project = s.project.present; const positions = project.sets[a.index].positions;
      if (!['x', 'y'].includes(a.axis) || !Number.isFinite(a.value) || a.value < 0 || a.value > (a.axis === 'x' ? project.field.width : project.field.height)) throw new Error('Enter a coordinate inside the field.');
      const delta = { x: 0, y: 0 }; delta[a.axis] = a.value - positions[a.id][a.axis];
      const updates = moveSelection(positions, [a.id], delta, project.field, project.snapping ?? DEFAULT_SNAPPING, s.ui.snap, a.id, { x: a.axis === 'x', y: a.axis === 'y' });
      c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: { ...set.positions, ...updates } } : set) }));
    } }),
  'formation.preview': define({ id: 'formation.preview', name: 'Preview formation', description: 'Preview a shape on the explicit selection before applying.', arguments: { kind: 'FormationKind?' }, enabled: s => (editable(s) || formationSessionCurrent(s)) && !s.ui.pendingDraft && !s.ui.dialog && !s.project.transactionName && s.selection.selectedIds.length > 0,
    execute: (c, a) => {
      const s = c.getState(); const kind = a.kind ?? s.ui.formation;
      const ids = s.ui.formationPreview?.ids ?? s.project.present.performers.filter(p => s.selection.selectedIds.includes(p.id)).map(p => p.id);
      const positions = s.project.present.sets[s.selection.activeIndex].positions;
      const center = s.ui.formationPreview?.options.center ?? formationCenter(positions, ids);
      const options: FormationOptions = { assignment: 'position', ...(s.ui.formationDrafts[kind] ?? { width: s.ui.formationWidth, height: s.ui.formationHeight, rotation: s.ui.formationRotation, columns: s.ui.formationColumns }), center };
      const previous = s.ui.formationPreview;
      const assignmentRotation = previous?.kind === kind ? previous.assignmentRotation ?? options.rotation : options.rotation;
      const order = previous?.kind === kind && previous.order ? previous.order : formationAssignmentOrder(positions, ids, kind, options);
      c.patch('ui', { workspace: 'design', view: '2d', formation: kind, formationPreview: { revision: s.project.revision, setId: s.project.present.sets[s.selection.activeIndex].id, ids, kind, options, order, assignmentRotation } });
    } }),
  'formation.update': define({ id: 'formation.update', name: 'Adjust formation preview', description: 'Update shape parameters without changing the project or history.', arguments: { options: 'FormationOptions' }, enabled: formationSessionCurrent,
    execute: (c, a) => { const s = c.getState(); const session = s.ui.formationPreview!;
      const options = { ...a.options, assignment: a.options.assignment ?? session.options.assignment ?? 'position' };
      const changedMode = options.assignment !== session.options.assignment;
      const assignmentRotation = changedMode ? options.rotation : session.assignmentRotation ?? session.options.rotation;
      const reassign = changedMode || !session.order || (session.kind === 'block' && options.columns !== session.options.columns);
      const order = reassign ? formationAssignmentOrder(s.project.present.sets[s.selection.activeIndex].positions, session.ids, session.kind, { ...options, rotation: assignmentRotation }) : session.order;
      c.patch('ui', { formationPreview: { ...session, options, order, assignmentRotation }, formationDrafts: { ...s.ui.formationDrafts, [session.kind]: options } });
    } }),
  'formation.cancel': define({ id: 'formation.cancel', name: 'Cancel formation', description: 'Discard the preview and keep the original positions.', arguments: {}, enabled: s => !!s.ui.formationPreview,
    execute: c => c.patch('ui', { formationPreview: null }) }),
  'formation.apply': define({ id: 'formation.apply', name: 'Apply formation', description: 'Commit the visible formation as one undoable edit.', arguments: {}, enabled: s => { const result = currentFormationResult(s); return !s.ui.pendingDraft && !!result?.changed && !result.error; },
    execute: c => { const s = c.getState(); const session = s.ui.formationPreview!; const result = currentFormationResult(s)!;
      c.edit(p => ({ ...p, sets: p.sets.map(set => set.id === session.setId ? { ...set, positions: { ...set.positions, ...result.updates } } : set) }));
      c.patch('ui', { formationPreview: null });
    } }),
  'transform.preview': define({ id: 'transform.preview', name: 'Preview exact transform', description: 'Preview rotation, scaling or a field mirror on the explicit selection.', arguments: { operation: 'rotate-scale | across-50 | front-back', angle: 'degrees?', scale: 'factor?' }, enabled: canIncrement,
    execute: beginTransform }),
  'transform.update': define({ id: 'transform.update', name: 'Adjust transform preview', description: 'Update the preview without changing saved geometry or history.', arguments: { options: 'ExactTransform' }, enabled: transformSessionCurrent,
    execute: (c, a) => c.patch('ui', { transformPreview: { ...c.getState().ui.transformPreview!, options: a.options } }) }),
  'transform.cancel': define({ id: 'transform.cancel', name: 'Cancel transform', description: 'Discard the transform preview and keep the original positions.', arguments: {}, enabled: s => !!s.ui.transformPreview, execute: c => c.patch('ui', { transformPreview: null }) }),
  'transform.apply': define({ id: 'transform.apply', name: 'Apply transform', description: 'Commit the exact preview as one undoable selection edit.', arguments: {}, enabled: s => { const result = currentTransformResult(s); return !s.ui.pendingDraft && !!result?.changed && !result.error; },
    execute: c => { const state = c.getState(); const session = state.ui.transformPreview!; const result = currentTransformResult(state)!;
      if (result.error || !result.changed) throw new Error(result.error ?? 'The preview matches the original positions.');
      c.edit(p => ({ ...p, sets: p.sets.map(set => set.id === session.setId ? { ...set, positions: { ...set.positions, ...result.updates } } : set) }));
      c.patch('ui', { transformPreview: null });
    } }),
  'spacing.preview': define({ id: 'spacing.preview', name: 'Align and space selection', description: 'Preview alignment, even distribution or exact intervals for at least two selected performers on this set.', arguments: {}, enabled: s => canIncrement(s) && s.selection.selectedIds.length >= 2,
    execute: c => { const s = c.getState(); c.patch('ui', { workspace: 'design', view: '2d', spacingPreview: { revision: s.project.revision, setId: s.project.present.sets[s.selection.activeIndex].id, ids: [...s.selection.selectedIds], options: defaultSpacing() } }); } }),
  'spacing.update': define({ id: 'spacing.update', name: 'Adjust spacing preview', description: 'Update exact intervals and alignment guides without editing the project.', arguments: { options: 'SpacingOptions' }, enabled: spacingSessionCurrent,
    execute: (c, a) => c.patch('ui', { spacingPreview: { ...c.getState().ui.spacingPreview!, options: a.options } }) }),
  'spacing.cancel': define({ id: 'spacing.cancel', name: 'Cancel spacing', description: 'Discard spacing guides and keep original positions.', arguments: {}, enabled: s => !!s.ui.spacingPreview, execute: c => c.patch('ui', { spacingPreview: null }) }),
  'spacing.apply': define({ id: 'spacing.apply', name: 'Apply spacing', description: 'Accept the visible spacing preview as one named undo action.', arguments: {}, enabled: s => { const result = currentSpacingResult(s); return !s.ui.pendingDraft && !!result?.changed && !result.error; },
    execute: c => { const s = c.getState(); const session = s.ui.spacingPreview!; const result = currentSpacingResult(s)!;
      c.edit(p => ({ ...p, sets: p.sets.map(set => set.id === session.setId ? { ...set, positions: { ...set.positions, ...result.updates } } : set) }));
      c.patch('ui', { spacingPreview: null });
    } }),
  'coordinates.preview': define({ id: 'coordinates.preview', name: 'Enter coordinates', description: 'Preview a drill-language coordinate for one performer or an exact relative move for the explicit selection.', arguments: { mode: 'absolute | relative?', text: 'drill phrase?', side: '1 | 2 | null?', defaultUnit: 'steps | yards | null?' }, enabled: canIncrement,
    execute: (c,a) => {const s=c.getState();const ids=[...new Set(s.selection.selectedIds)];const options=validateCoordinateEntryOptions({mode:a?.mode??(ids.length===1?'absolute':'relative'),text:a?.text??'',side:a?.side??null,defaultUnit:a?.defaultUnit===undefined?'steps':a.defaultUnit});c.patch('ui',{workspace:'design',view:'2d',coordinatePreview:{revision:s.project.revision,setId:s.project.present.sets[s.selection.activeIndex].id,ids,options}});} }),
  'coordinates.update': define({ id: 'coordinates.update', name: 'Adjust coordinate entry', description: 'Parse the phrase and update the preview without changing geometry or history.', arguments: { options: 'CoordinateEntryOptions' }, enabled: coordinateSessionCurrent,
    execute: (c,a)=>{const options=validateCoordinateEntryOptions(a?.options);c.patch('ui',{coordinatePreview:{...c.getState().ui.coordinatePreview!,options}});} }),
  'coordinates.cancel': define({ id: 'coordinates.cancel', name: 'Cancel coordinate entry', description: 'Discard the coordinate preview and preserve the original selection and positions.', arguments:{},enabled:s=>!!s.ui.coordinatePreview,execute:c=>c.patch('ui',{coordinatePreview:null}) }),
  'coordinates.apply': define({ id: 'coordinates.apply', name: 'Apply coordinates', description: 'Accept the exact coordinate or group delta as one named undo action.', arguments:{},enabled:s=>{const result=currentCoordinateResult(s);return !s.ui.pendingDraft && !!result?.changed && !result.error;},
    execute:c=>{const s=c.getState();const session=s.ui.coordinatePreview!;const result=currentCoordinateResult(s)!;c.edit(p=>({...p,sets:p.sets.map(set=>set.id===session.setId?{...set,positions:{...set.positions,...result.updates}}:set)}));c.patch('ui',{coordinatePreview:null});} }),
  'project.update': define({ id: 'project.update', name: 'Update production', description: 'Edit production metadata, field markings or audio synchronization.', arguments: { title: 'string?', ensemble: 'string?', audioOffsetSeconds: 'number?', preset: 'college | high-school?' }, enabled: always,
    execute: (c, { preset, ...update }) => c.edit(p => ({ ...p, ...update, field: preset ? { ...p.field, preset } : p.field })) }),
  'project.load': define({ id: 'project.load', name: 'Load production', description: 'Replace the production and reset edit history.', arguments: { project: 'Project v2' }, enabled: always, execute: (c, a) => c.load(a.project) }),
  'history.undo': define({ id: 'history.undo', name: 'Undo', description: 'Restore the previous project edit.', arguments: {}, enabled: s => !s.project.transactionName && s.project.past.length > 0, execute: c => c.history('undo') }),
  'history.redo': define({ id: 'history.redo', name: 'Redo', description: 'Restore an undone project edit.', arguments: {}, enabled: s => !s.project.transactionName && s.project.future.length > 0, execute: c => c.history('redo') }),
  'history.open': define({ id: 'history.open', name: 'History', description: 'Review named actions and the session history limit.', arguments: {}, enabled: always, execute: c => showDialog(c, 'history') }),
  'set.update': define({ id: 'set.update', name: 'Edit set properties', description: 'Update set name, counts, tempo, transition or rehearsal notes.', arguments: { index: 'integer', update: 'set properties' }, enabled: (s, a) => setExists(s, a.index), execute: (c, a) => {
    validateSetUpdate(a.update, a.index);
    const wasAtSet = Math.abs(c.getState().playback.count - setStartCount(c.getState().project.present, a.index)) < 0.001;
    c.edit(p => updateSetProperties(p, a.index, a.update));
    if (a.update.counts !== undefined && wasAtSet) c.patch('playback', { count: setStartCount(c.getState().project.present, a.index) });
  } }),
  'set.create': define({ id: 'set.create', name: 'Create set', description: 'Apply the reviewed set operation as one undoable edit.', arguments: { index: 'integer', kind: 'new | duplicate | insert-before | hold', counts: 'integer?', tempo: 'BPM?' },
    enabled: (s, a) => !!a && ['new', 'duplicate', 'insert-before', 'hold'].includes(a.kind) && setExists(s, a.index) && s.project.present.sets.length < PROJECT_LIMITS.sets && canNavigate({ ...s, ui: { ...s.ui, dialog: s.ui.dialog === 'set-create' ? null : s.ui.dialog } }),
    execute: (c, a) => applySetCreation(c, a.index, a.kind, { ...(a.counts === undefined ? {} : { counts: a.counts }), ...(a.tempo === undefined ? {} : { tempo: a.tempo }) }) }),
  'set.add': define({ id: 'set.add', name: 'New set after index', description: 'Create a fresh staging grid with blank notes and the default move counts.', arguments: { index: 'integer' }, enabled: (s, a) => !!a && setExists(s, a.index) && canOpenSetCreation(s),
    execute: (c, a) => applySetCreation(c, a.index, 'new') }),
  'set.remove': define({ id: 'set.remove', name: 'Delete set', description: 'Remove a set and connect its neighbors.', arguments: { index: 'integer' }, enabled: (s, a) => setExists(s, a.index) && s.project.present.sets.length > 1, execute: (c, a) => { c.edit(p => reconnectSets(p, p.sets.filter((_, i) => i !== a.index))); selectSet(c, Math.max(0, a.index - 1)); c.patch('ui', { dialog: null }); } }),
  'set.reorder': define({ id: 'set.reorder', name: 'Move set', description: 'Move a set earlier or later in the show.', arguments: { index: 'integer', direction: '-1 | 1' }, enabled: (s, a) => setExists(s, a.index) && setExists(s, a.index + a.direction), execute: (c, a) => { c.edit(p => { const sets = [...p.sets]; const target = a.index + a.direction; [sets[a.index], sets[target]] = [sets[target], sets[a.index]]; return reconnectSets(p, sets); }); selectSet(c, a.index + a.direction); } }),
  'performers.add': define({ id: 'performers.add', name: 'Add performers', description: 'Add roster members and starting positions to every set.', arguments: { performers: 'Performer[]' }, enabled: (s, a) => a.performers.length > 0 && s.project.present.performers.length + a.performers.length <= PROJECT_LIMITS.performers, execute: (c, a) => { c.edit(p => { const start = p.performers.length; return { ...p, performers: [...p.performers, ...a.performers], sets: p.sets.map(set => ({ ...set, positions: { ...set.positions, ...Object.fromEntries(a.performers.map((performer, i) => [performer.id, { x: 5 + ((start + i) % 40) * 2.3, y: Math.max(1, p.field.height - 3 - Math.floor((start + i) / 40) * 2.3) }])) } })) }; }); c.patch('selection', { selectedIds: a.performers.map(p => p.id) }); c.patch('ui', { dialog: null }); } }),
  'performers.remove': define({ id: 'performers.remove', name: 'Remove performers', description: 'Remove roster members and their positions in every set.', arguments: { ids: 'string[]' }, enabled: (s, a) => a.ids.some(id => s.project.present.performers.some(p => p.id === id)), execute: (c, a) => { c.edit(p => ({ ...p, performers: p.performers.filter(person => !a.ids.includes(person.id)), ...(p.selectionGroups ? { selectionGroups: p.selectionGroups.map(g => ({ ...g, performerIds: g.performerIds.filter(id => !a.ids.includes(id)) })) } : {}), moves: p.moves.map(move => ({ ...move, paths: Object.fromEntries(Object.entries(move.paths).filter(([id]) => !a.ids.includes(id))) })), sets: p.sets.map(set => ({ ...set, positions: Object.fromEntries(Object.entries(set.positions).filter(([id]) => !a.ids.includes(id))) })) })); c.patch('selection', { selectedIds: [] }); c.patch('ui', { dialog: null }); } }),
  'performer.update': define({ id: 'performer.update', name: 'Edit performer', description: 'Update a performer name or section across the show.', arguments: { id: 'string', update: 'name? | sectionId?' }, enabled: (s, a) => s.project.present.performers.some(p => p.id === a.id), execute: (c, a) => c.edit(p => ({ ...p, performers: p.performers.map(person => person.id === a.id ? { ...person, ...a.update } : person) })) }),
  'section.add': define({ id: 'section.add', name: 'Add section', description: 'Add an ensemble section.', arguments: {}, enabled: s => s.project.present.sections.length < PROJECT_LIMITS.sections, execute: c => c.edit(p => ({ ...p, sections: [...p.sections, { id: uid(), name: `Section ${p.sections.length + 1}`, color: '#a6cce2' }] })) }),
  'section.update': define({ id: 'section.update', name: 'Edit section', description: 'Update section name or color.', arguments: { id: 'string', update: 'name? | color?' }, enabled: (s, a) => s.project.present.sections.some(section => section.id === a.id), execute: (c, a) => c.edit(p => ({ ...p, sections: p.sections.map(section => section.id === a.id ? { ...section, ...a.update } : section) })) }),
  'positions.move': define({ id: 'positions.move', name: 'Move performers', description: 'Set performer coordinates on the active editable set.', arguments: { index: 'integer', updates: 'Record<performerId, Point>' }, enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex, execute: (c, a) => c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: { ...set.positions, ...a.updates } } : set) })) }),
  'selection.transform': define({ id: 'selection.transform', name: 'Transform selection', description: 'Move, rotate or scale selected performers within the field.', arguments: { index: 'integer', ids: 'string[]', options: 'dx? | dy? | rotation? | scale?' }, enabled: (s, a) => editable(s) && a.index === s.selection.activeIndex && a.ids.length > 0, execute: (c, a) => c.edit(p => ({ ...p, sets: p.sets.map((set, i) => i === a.index ? { ...set, positions: a.options.rotation !== undefined || a.options.scale !== undefined ? transformPositions(set.positions, a.ids, a.options, p.field) : { ...set.positions, ...moveSelection(set.positions, a.ids, { x: a.options.dx ?? 0, y: a.options.dy ?? 0 }, p.field, p.snapping ?? DEFAULT_SNAPPING, c.getState().ui.snap, undefined, { x: !!a.options.dx, y: !!a.options.dy, advance: true }) } } : set) })) }),
  'selection.all': define({ id: 'selection.all', name: 'Select all performers', description: 'Select the full ensemble.', arguments: {}, enabled: s => !s.ui.dialog, execute: c => c.patch('selection', { selectedIds: c.getState().project.present.performers.map(p => p.id) }) }),
  'selection.clear': define({ id: 'selection.clear', name: 'Clear selection', description: 'Clear selected performers and dismiss the project menu.', arguments: {}, enabled: always, execute: c => { c.patch('selection', { selectedIds: [] }); c.patch('ui', { menu: false }); } }),
  'set.select': define({ id: 'set.select', name: 'Go to set', description: 'Stop playback and arrive at a set for editing.', arguments: { index: 'integer' }, enabled: (_s, a) => Number.isInteger(a.index), execute: (c, a) => selectSet(c, a.index) }),
  'playback.toggle': define({ id: 'playback.toggle', name: 'Play / pause', description: 'Rehearse or pause the production.', arguments: {}, enabled: s => totalCounts(s.project.present) > 0, execute: c => { const s = c.getState(), bounds = rehearsalBounds(s.project.present, s.playback.rehearsalId); c.patch('playback', { playing: !s.playback.playing, count: s.playback.count >= bounds.end || s.playback.count < bounds.start ? bounds.start : s.playback.count }); } }),
  'playback.scrub': define({ id: 'playback.scrub', name: 'Seek count', description: 'Stop playback and inspect a count.', arguments: { count: 'number' }, enabled: (_s, a) => Number.isFinite(a.count), execute: (c, a) => { const p = c.getState().project.present; const count = Math.max(0, Math.min(totalCounts(p), a.count)); const bounds = rehearsalBounds(p, c.getState().playback.rehearsalId); if (count < bounds.start || count > bounds.end) c.patch('playback', { rehearsalId: null }); c.patch('playback', { playing: false, count, seekVersion: c.getState().playback.seekVersion + 1 }); c.patch('selection', { activeIndex: sampleTimeline(p, count).setIndex }); } }),
  'tool.select': define({ id: 'tool.select', name: 'Select / pan / lasso', description: 'Choose box selection, pan or a freehand lasso. Lasso results are reviewed before Apply.', arguments: { tool: 'select | pan | lasso' }, enabled: (s, a) => !!a && ['select', 'pan', 'lasso'].includes(a.tool) && (a.tool !== 'lasso' || !s.ui.dialog && !s.ui.pendingDraft && editable(s)), execute: (c, a) => c.patch('ui', { tool: a.tool }) }),
  'dialog.open': define({ id: 'dialog.open', name: 'Open dialog', description: 'Open an editor dialog and stop playback.', arguments: { dialog: 'Dialog' }, enabled: always, execute: (c, a) => {
    showDialog(c, a.dialog);
    if (a.dialog === 'add-cast') { const s = c.getState(); c.patch('ui', { castAmount: Math.max(1, Math.min(s.ui.castAmount, PROJECT_LIMITS.performers - s.project.present.performers.length)) }); }
  } }),
  'file.new': define({ id: 'file.new', name: 'New production', description: 'Choose a blank production or demo.', arguments: {}, enabled: always, execute: c => { assertCanReplace(c.getState()); showDialog(c, 'new'); c.patch('ui', { menu: false }); } }),
  'file.open': define({ id: 'file.open', name: 'Open production', description: 'Open a saved .squid project.', arguments: {}, enabled: always, execute: c => c.external('file.open') }),
  'file.save': define({ id: 'file.save', name: 'Save production', description: 'Save an editable .squid file.', arguments: {}, enabled: always, execute: c => c.external('file.save') }),
  'file.save-as': define({ id: 'file.save-as', name: 'Save production as', description: 'Choose a new destination for the project.', arguments: {}, enabled: always, execute: c => c.external('file.save-as') }),
  'file.export': define({ id: 'file.export', name: 'Export rehearsal packet', description: 'Choose field charts, coordinates, CSV or SVG.', arguments: {}, enabled: always, execute: c => showDialog(c, 'export') }),
  'help.open': define({ id: 'help.open', name: 'Help', description: 'Open workflow help and command shortcuts.', arguments: {}, enabled: always, execute: c => { showDialog(c, 'help'); c.patch('ui', { menu: false }); } }),
} satisfies { [I in CommandId]: CommandDefinition<I> };

export const commandMetadata = Object.values(commandRegistry).map(({ id, name, description, arguments: args }) => ({ id, name, description, arguments: args }));
export const shortcutCommands = [...shortcutIds.map(id => commandRegistry[id]), commandRegistry['selection.clear'], commandRegistry['selection.nudge']];
export function executeCommand<I extends CommandId>(context: CommandContext, id: I, args: CommandArguments[I]): boolean | Promise<boolean> {
  const definition = commandRegistry[id] as unknown as CommandDefinition<I>;
  if (!definition.enabled(context.getState(), args)) return false;
  const result = definition.execute(context, args);
  return result instanceof Promise ? result.then(() => true) : true;
}
