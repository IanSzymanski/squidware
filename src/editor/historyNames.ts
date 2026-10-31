import type { CommandArguments, CommandId } from './commands';
import type { EditorState } from './state';
import { nudgeLabel } from '../editIncrements';

export function historyName<I extends CommandId>(state: EditorState, id: I, args: CommandArguments[I]): string {
  const project = state.project.present;
  const a = (args ?? {}) as Record<string, unknown>;
  const index = typeof a.index === 'number' ? a.index : state.selection.activeIndex;
  const set = project.sets[index];
  const picture = `Set ${index + 1}${set ? ' · ' + set.name : ''}`;
  const update = (a.update ?? a) as Record<string, unknown>;
  const ids = Array.isArray(a.ids) ? a.ids as string[] : Object.keys((a.updates ?? {}) as object);
  const selection = ids.length === 1 ? project.performers.find(p => p.id === ids[0])?.label ?? '1 performer' : `${ids.length} performers`;
  let name: string;
  switch (id) {
    case 'schedule.save': name = `Edit movement timing · ${project.performers.find(p => p.id === a.performerId)?.label ?? 'performer'} — ${picture}`; break;
    case 'path.save': name = `Edit travel path · ${project.performers.find(p => p.id === a.performerId)?.label ?? 'performer'} — ${picture}`; break;
    case 'templates.apply': name = `Apply saved formation · ${(a.template as { name?: string })?.name ?? 'Template'} · ${ids.length} performers — ${picture}`; break;
    case 'audio.align-save': name = 'Align recording'; break;
    case 'tempo.save': name = 'Edit tempo map'; break;
    case 'set.split': name = `Split transition · count ${a.count}`; break;
    case 'score.save': name = 'Edit musical score map'; break;
    case 'sheet.apply': name = `Edit production sheet · ${Array.isArray(a.cells) ? a.cells.length : 0} rows`; break;
    case 'sheet.append': name = 'Append production sheet row'; break;
    case 'metronome.configure': name = 'Edit production meter'; break;
    case 'analysis.rules-save': name = 'Edit production analysis rules'; break;
    case 'analysis.direction-set': name = `${a.direction ? `Declare ${a.direction} travel` : 'Clear travel direction'} · ${ids.length} performers — ${picture}`; break;
    case 'rehearsal.save': name = `Save rehearsal passage · ${(a.passage as { name: string }).name}`; break;
    case 'rehearsal.remove': name = `Delete rehearsal passage · ${project.rehearsal?.find(p => p.id === a.id)?.name ?? 'passage'}`; break;
    case 'selection.nudge': name = `Nudge ${state.selection.selectedIds.length} ${state.selection.selectedIds.length === 1 ? 'performer' : 'performers'} · ${nudgeLabel(state.preferences.value, project, a.fast === true)} — ${picture}`; break;
    case 'snapping.update': name = 'Change grid and snapping'; break;
    case 'positions.place': name = `Place ${project.performers.find(p => p.id === a.id)?.label ?? 'performer'} — ${picture}`; break;
    case 'project.update': name = Object.hasOwn(update, 'title') ? 'Rename production' : Object.hasOwn(update, 'ensemble') ? 'Edit ensemble' : Object.hasOwn(update, 'preset') ? 'Change field markings' : 'Edit production settings'; break;
    case 'set.update': name = `${Object.hasOwn(update, 'notes') ? 'Edit notes' : Object.hasOwn(update, 'name') ? 'Rename picture' : 'Edit move timing'} — ${picture}`; break;
    case 'set.create': name = `${a.kind === 'duplicate' ? 'Duplicate' : a.kind === 'hold' ? 'Hold positions after' : a.kind === 'insert-before' ? 'Insert before' : 'New set after'} ${picture}`; break;
    case 'set.add': name = `New set after ${picture}`; break;
    case 'set.remove': name = `Remove ${picture}`; break;
    case 'set.reorder': name = `Reorder ${picture}`; break;
    case 'set.move-to': name = `Move set ${project.sets.findIndex(set => set.id === a.id) + 1} · ${project.sets.find(set => set.id === a.id)?.name ?? ''} to position ${Number(a.target) + 1}`; break;
    case 'positions.move': name = `Move ${selection} — ${picture}`; break;
    case 'selection.transform': name = `Transform ${selection} — ${picture}`; break;
    case 'transform.apply': {
      const session = state.ui.transformPreview;
      name = `${session?.options.operation === 'across-50' ? 'Mirror across 50' : session?.options.operation === 'front-back' ? 'Flip front/back' : 'Rotate/scale'} ${session?.ids.length ?? 0} performers — ${picture}`; break;
    }
    case 'formation.apply': name = `Apply ${state.ui.formationPreview?.kind} to ${state.ui.formationPreview?.ids.length ?? 0} performers (${state.ui.formationPreview?.options.assignment === 'position' ? 'positional' : 'roster'} assignment) — ${picture}`; break;
    case 'spacing.apply': {
      const session = state.ui.spacingPreview; const options = session?.options;
      const operation = options?.operation === 'align' ? 'Align' : options?.operation === 'distribute' ? 'Distribute' : `Space at ${options?.interval} ${options?.unit}`;
      name = `${operation} ${session?.ids.length ?? 0} performers · ${options?.angle}° axis — ${picture}`; break;
    }
    case 'coordinates.apply': {
      const session=state.ui.coordinatePreview;const action=session?.options.mode==='absolute'?'Place':'Move';
      const count=session?.ids.length??0;const target=count===1?project.performers.find(p=>p.id===session!.ids[0])?.label??'1 performer':`${count} performers`;
      name=`${action} ${target} · ${session?.options.text.slice(0,96)??''} — ${picture}`;break;
    }
    case 'group.create': name = `Save selection group · ${a.name}`; break;
    case 'group.rename': name = `Rename selection group · ${a.name}`; break;
    case 'group.update': name = `Replace group members · ${project.selectionGroups?.find(g => g.id === a.id)?.name ?? 'group'}`; break;
    case 'group.remove': name = `Delete selection group · ${project.selectionGroups?.find(g => g.id === a.id)?.name ?? 'group'}`; break;
    case 'performers.add': name = `Add ${Array.isArray(a.performers) ? a.performers.length : 0} performers`; break;
    case 'performers.remove': name = `Remove ${selection}`; break;
    case 'performer.update': name = `${Object.hasOwn(update, 'name') ? 'Rename' : 'Change section for'} ${project.performers.find(p => p.id === a.id)?.label ?? 'performer'}`; break;
    case 'section.add': name = 'Add section'; break;
    case 'section.update': name = `${Object.hasOwn(update, 'color') ? 'Recolor' : 'Rename'} ${project.sections.find(s => s.id === a.id)?.name ?? 'section'}`; break;
    default: name = 'Edit production';
  }
  return name.slice(0, 240);
}
