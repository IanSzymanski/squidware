import type { CommandArguments, CommandId } from './commands';
import type { EditorState } from './state';

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
    case 'snapping.update': name = 'Change grid and snapping'; break;
    case 'positions.place': name = `Place ${project.performers.find(p => p.id === a.id)?.label ?? 'performer'} — ${picture}`; break;
    case 'project.update': name = Object.hasOwn(update, 'title') ? 'Rename production' : Object.hasOwn(update, 'ensemble') ? 'Edit ensemble' : Object.hasOwn(update, 'preset') ? 'Change field markings' : 'Edit production settings'; break;
    case 'set.update': name = `${Object.hasOwn(update, 'notes') ? 'Edit notes' : Object.hasOwn(update, 'name') ? 'Rename picture' : 'Edit move timing'} — ${picture}`; break;
    case 'set.add': name = `Add picture after ${picture}`; break;
    case 'set.remove': name = `Remove ${picture}`; break;
    case 'set.reorder': name = `Reorder ${picture}`; break;
    case 'positions.move': name = `Move ${selection} — ${picture}`; break;
    case 'selection.transform': name = `Transform ${selection} — ${picture}`; break;
    case 'transform.apply': {
      const session = state.ui.transformPreview;
      name = `${session?.options.operation === 'across-50' ? 'Mirror across 50' : session?.options.operation === 'front-back' ? 'Flip front/back' : 'Rotate/scale'} ${session?.ids.length ?? 0} performers — ${picture}`; break;
    }
    case 'formation.apply': name = `Apply ${state.ui.formationPreview?.kind} to ${state.ui.formationPreview?.ids.length ?? 0} performers — ${picture}`; break;
    case 'performers.add': name = `Add ${Array.isArray(a.performers) ? a.performers.length : 0} performers`; break;
    case 'performers.remove': name = `Remove ${selection}`; break;
    case 'performer.update': name = `${Object.hasOwn(update, 'name') ? 'Rename' : 'Change section for'} ${project.performers.find(p => p.id === a.id)?.label ?? 'performer'}`; break;
    case 'section.add': name = 'Add section'; break;
    case 'section.update': name = `${Object.hasOwn(update, 'color') ? 'Recolor' : 'Rename'} ${project.sections.find(s => s.id === a.id)?.name ?? 'section'}`; break;
    default: name = 'Edit production';
  }
  return name.slice(0, 240);
}
