import { DRILL_ENTRY_LIMIT, previewCoordinateEntry, type CoordinateEntryOptions } from '../drillEntry';
import { defaultSpacing, previewSpacing, type SpacingOptions } from '../spacing';
import { defaultTransform, previewExactTransform, type ExactTransform } from '../transforms';
import { canEditPositions } from './editMode';
import type { EditorState } from './state';

export type DrillCommand =
  | { kind: 'coordinates'; options: CoordinateEntryOptions; label: string | null }
  | { kind: 'mirror'; options: ExactTransform }
  | { kind: 'interval'; options: SpacingOptions };
export function isDrillPhrase(text: string): boolean { return /^(move|mirror|interval|place)\s+\S/i.test(text.trim()); }
/** Parse an entire phrase. Never infer a performer, mirror axis or interval direction. */
export function parseDrillCommand(input: string): DrillCommand {
  if (input.length > DRILL_ENTRY_LIMIT) throw new Error(`Use at most ${DRILL_ENTRY_LIMIT} characters.`);
  const raw = input.trim(); const text = raw.replace(/\s+/g, ' ');
  const move = /^move (.+)$/i.exec(text);
  if (move) return { kind: 'coordinates', label: null, options: { mode: 'relative', text: move[1], side: null, defaultUnit: 'steps' } };
  const place = /^place\s+(?:"([^"]+)"|(\S+))\s+at\s+(.+)$/i.exec(raw);
  if (place) return { kind: 'coordinates', label: place[1] ?? place[2], options: { mode: 'absolute', text: place[3], side: null, defaultUnit: 'steps' } };
  if (/^mirror (?:across (?:the )?50|front[- ]back)$/i.test(text)) return { kind: 'mirror', options: { ...defaultTransform(), operation: /50/.test(text) ? 'across-50' : 'front-back' } };
  const interval = /^interval (\d+(?:\.\d+)?|\.\d+)(?: (steps?|yards?))? (horizontal|vertical)(?: anchor (start|center|end))?$/i.exec(text);
  if (interval) return { kind: 'interval', options: { ...defaultSpacing(), operation: 'interval', angle: interval[3].toLowerCase() === 'horizontal' ? 0 : 90, interval: Number(interval[1]), unit: interval[2]?.toLowerCase().startsWith('yard') ? 'yards' : 'steps', anchor: interval[4]?.toLowerCase() as SpacingOptions['anchor'] ?? 'center' } };
  if (/^mirror\b/i.test(text)) throw new Error('Name the mirror axis: mirror across 50 or mirror front-back.');
  if (/^interval\b/i.test(text)) throw new Error('Name the interval and axis: interval 2 steps horizontal [anchor start|center|end].');
  if (/^place\b/i.test(text)) throw new Error('Name an exact performer label and both axes: place B1 at Side 1: on the 40; on front hash.');
  throw new Error('Use move 4 forward; mirror across 50; interval 2 steps horizontal; or place B1 at a complete coordinate.');
}
export interface DrillPlan { command: DrillCommand; ids: string[]; summary: string }
export function drillPlan(state: EditorState, text: string): { plan: DrillPlan | null; error: string | null } {
  try {
    const command = parseDrillCommand(text);
    if (state.ui.dialog || state.ui.pendingDraft || state.project.transactionName) throw new Error('Finish or cancel the current input or dialog first.');
    if (!canEditPositions(state)) throw new Error('Pause at a set and finish or cancel the current preview first.');
    const project = state.project.present; const positions = project.sets[state.selection.activeIndex].positions;
    let ids = [...state.selection.selectedIds];
    if (command.kind === 'coordinates' && command.label) {
      const matches = project.performers.filter(p => p.label.toLowerCase() === command.label!.toLowerCase());
      if (matches.length !== 1) throw new Error(`Use one exact, unambiguous performer label. “${command.label}” matches ${matches.length} performers.`);
      ids = [matches[0].id];
    }
    const result = command.kind === 'coordinates' ? previewCoordinateEntry(positions, ids, command.options, project)
      : command.kind === 'mirror' ? previewExactTransform(positions, ids, command.options, project.field)
      : previewSpacing(positions, ids, command.options, project.field, project);
    if (result.error) throw new Error(result.error);
    if (!result.changed) throw new Error('The preview matches the current positions. No edit is needed.');
    const summary = command.kind === 'coordinates' ? `${command.label ? `Place ${command.label}` : `Move ${ids.length} selected performers`} · ${command.options.text}`
      : command.kind === 'mirror' ? `Mirror ${ids.length} selected performers ${command.options.operation === 'across-50' ? 'across midfield' : 'front/back'}`
      : `Space ${ids.length} selected performers at ${command.options.interval} ${command.options.unit} · ${command.options.angle === 0 ? 'horizontal' : 'vertical'} · ${command.options.anchor} anchor`;
    return { plan: { command, ids, summary }, error: null };
  } catch (error) { return { plan: null, error: (error as Error).message }; }
}
