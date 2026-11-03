import type { FormationSession, FormationResult } from '../formationPreview';
import type { LiveFormation, Project, Point } from '../types';
import { liveFormationName, liveFormationPoints } from '../liveFormations';
import { validateProjectEdit } from '../domain';
import { previewFormation } from '../formationPreview';
import type { EditorState } from './state';
import { isAtActiveSet } from './editMode';

export function formationSessionCurrent(state: EditorState): boolean {
  const session = state.ui.formationPreview;
  if (!session) return false;
  const selected = new Set(state.selection.selectedIds);
  return session.revision === state.project.revision && session.setId === state.project.present.sets[state.selection.activeIndex]?.id
    && !state.playback.playing && !state.project.transactionName && isAtActiveSet(state)
    && state.ui.workspace === 'design' && state.ui.view === '2d' && !state.ui.dialog && !state.ui.transformPreview
    && session.ids.length === selected.size && session.ids.every(id => selected.has(id));
}
export function currentFormationResult(state: EditorState) {
  const session = state.ui.formationPreview;
  return session && formationSessionCurrent(state) ? previewFormationSession(state.project.present,session) : null;
}

export function sessionLiveFormation(session: FormationSession): LiveFormation {
  const live = session.live!;
  return { ...(session.bezier ? {bezier:session.bezier} : {}), id: live.id, name: liveFormationName(live.name), kind: session.kind, options: { ...session.options, assignment: session.options.assignment ?? 'position' }, slotCount: live.slotCount,
    members: (session.order ?? session.ids).map((performerId,index)=>({performerId,slot:live.slots[index]})).sort((a,b)=>a.slot-b.slot) };
}
export function formationProject(project: Project, session: FormationSession, positions: Record<string, Point>): Project {
  return { ...project, sets: project.sets.map(set => {
    if (set.id !== session.setId) return set;
    return { ...set, positions, ...(session.live ? { liveFormations: [...(set.liveFormations ?? []).filter(s=>s.id!==session.live!.id),sessionLiveFormation(session)] } : {}) };
  }) };
}
export function previewFormationSession(project: Project, session: FormationSession): FormationResult {
  const positions = project.sets.find(s=>s.id===session.setId)!.positions;
  if (!session.live) return previewFormation(positions,session.ids,session.kind,session.options,project.field,session.order);
  try {
    const shape = sessionLiveFormation(session);
    const conflict = project.sets.find(s=>s.id===session.setId)!.liveFormations?.find(f=>f.id!==shape.id && f.members.some(m=>session.ids.includes(m.performerId)));
    if (conflict) throw Error(`A performer belongs to another live formation: ${conflict.name}. Remove that member from this preview, or Cancel and detach the existing membership first.`);
    const updates = liveFormationPoints(shape,project.field), next = {...positions,...updates};
    validateProjectEdit(project,formationProject(project,session,next));
    const distances = Object.entries(updates).map(([id,p])=>Math.hypot(p.x-positions[id].x,p.y-positions[id].y));
    const original = project.sets.find(s=>s.id===session.setId)?.liveFormations?.find(s=>s.id===shape.id);
    return { positions:next,updates,changed:distances.some(d=>d>1e-9) || JSON.stringify(original)!==JSON.stringify(shape),error:null,travel:{total:distances.reduce((a,b)=>a+b,0),maximum:Math.max(0,...distances)} };
  } catch(error) { return { positions, updates:{}, changed:false,error:(error as Error).message,travel:null }; }
}
