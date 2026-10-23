import { PROJECT_LIMITS, sampleTimeline } from '../domain';
import { activePassage, resolvePassage, validateRehearsal } from '../rehearsal';
import type { CommandDefinition, CommandId } from './commands';
import type { EditorState } from './state';
const define = <I extends CommandId>(definition: CommandDefinition<I>) => definition;
const available = (s: EditorState) => !s.ui.pendingDraft && !s.project.transactionName && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview && !s.ui.selectionPreview && (!s.ui.dialog || s.ui.dialog === 'rehearsal');
export const rehearsalCommands = {
  'rehearsal.open': define({ id: 'rehearsal.open', name: 'Rehearsal passages', description: 'Save annotated bookmarks, count ranges and section or performer focus.', arguments: {}, enabled: s => available(s) && !s.ui.dialog,
    execute: c => { c.patch('playback', { playing: false }); c.patch('ui', { dialog: 'rehearsal', menu: false }); } }),
  'rehearsal.save': define({ id: 'rehearsal.save', name: 'Save rehearsal passage', description: 'Apply an annotated bookmark or range as one undoable metadata edit.', arguments: { passage: 'RehearsalPassage' }, enabled: (s, a) => available(s) && !!a?.passage,
    execute: (c, a) => {
      const p = c.getState().project.present, passage = validateRehearsal([a.passage])[0];
      const error = resolvePassage(p, passage).error;
      if (error) throw new Error(error);
      if (!activePassage(p, passage.id) && (p.rehearsal?.length ?? 0) >= PROJECT_LIMITS.rehearsalPassages) throw new Error(`At most ${PROJECT_LIMITS.rehearsalPassages} rehearsal passages can be saved.`);
      c.edit(p => ({ ...p, rehearsal: activePassage(p, passage.id) ? p.rehearsal!.map(item => item.id === passage.id ? passage : item) : [...p.rehearsal ?? [], passage] }));
    } }),
  'rehearsal.remove': define({ id: 'rehearsal.remove', name: 'Delete rehearsal passage', description: 'Delete the annotation and bookmark or range, preserving all drill geometry.', arguments: { id: 'passage ID' }, enabled: (s, a) => available(s) && !!a && !!activePassage(s.project.present, a.id),
    execute: (c, a) => c.edit(p => ({ ...p, rehearsal: p.rehearsal!.filter(item => item.id !== a.id) })) }),
  'rehearsal.activate': define({ id: 'rehearsal.activate', name: 'Go to rehearsal passage', description: 'Pause at the saved start and apply rehearsal focus. Play and Loop use the saved range.', arguments: { id: 'passage ID' }, enabled: (s, a) => { const p = a && activePassage(s.project.present, a.id); return available(s) && !!p && !resolvePassage(s.project.present, p).error; },
    execute: (c, a) => { const s = c.getState(), passage = activePassage(s.project.present, a.id)!, resolved = resolvePassage(s.project.present, passage);
      c.patch('playback', { rehearsalId: a.id, count: resolved.start.count, playing: false, seekVersion: s.playback.seekVersion + 1 });
      c.patch('selection', { activeIndex: sampleTimeline(s.project.present, resolved.start.count).setIndex });
      c.patch('ui', { workspace: 'design', dialog: null });
    } }),
  'rehearsal.clear': define({ id: 'rehearsal.clear', name: 'Full show rehearsal', description: 'Clear the saved range and focus; pause with the full ensemble visible.', arguments: {}, enabled: s => available(s) && !!s.playback.rehearsalId,
    execute: c => c.patch('playback', { rehearsalId: null, playing: false }) }),
};
