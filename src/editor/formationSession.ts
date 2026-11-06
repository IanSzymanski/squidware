import type { FormationAssignmentMode, FormationSession, FormationResult } from '../formationPreview';
import type { FormationKind, FormationOptions, LiveFormation, Project, Point } from '../types';
import { formationAssignmentOrder, shortestTravelOrder } from '../formationAssignment';
import { generateFormation } from '../formationGeometry';
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
/** Assignment review owns a frozen draft. Retain it behind that modal while
 * keeping ordinary formation editing/Apply commands disabled until it closes. */
export function formationSessionRetained(state:EditorState):boolean {
  return formationSessionCurrent(state)||state.ui.dialog==='assignment'&&formationSessionCurrent({...state,ui:{...state.ui,dialog:null}});
}
export function currentFormationResult(state: EditorState) {
  const session = state.ui.formationPreview;
  return session && formationSessionCurrent(state) ? previewFormationSession(state.project.present,session) : null;
}

/** Sessions reopened from saved data carry only the persisted positional/roster choice. */
export const sessionAssignmentMode = (session: Pick<FormationSession, 'assignmentMode' | 'options'>): FormationAssignmentMode =>
  session.assignmentMode ?? (session.options.assignment === 'position' ? 'position' : 'roster');
/** The exact solver is O(n³); above this size a new preview starts in positional order so opening Shape stays responsive. */
export const SHORTEST_DEFAULT_LIMIT = 150;
/** New previews use shortest travel for ordinary selections; choosing it explicitly still solves at any size. */
export const defaultAssignmentMode = (count: number): FormationAssignmentMode => count <= SHORTEST_DEFAULT_LIMIT ? 'shortest' : 'position';
/** Identifies the shape a shortest-travel order was solved for (kind and geometry, not the stored assignment). */
export function shortestGeometryKey(kind: FormationKind, options: FormationOptions): string {
  const { assignment: _assignment, ...geometry } = options; return JSON.stringify([kind, geometry]);
}
/** A kept shortest-travel order stops being the shortest solution once the geometry moves away from the solved shape. */
export const shortestOrderStale = (session: FormationSession) => sessionAssignmentMode(session) === 'shortest' && !session.assignmentReviewed && !session.assignmentConstraints
  && session.assignmentSolvedFor !== undefined && session.assignmentSolvedFor !== shortestGeometryKey(session.kind, session.options);
/** Shortest travel solves against the generated slots; positional order sorts along the assignment rotation. */
export function sessionAssignmentOrder(positions: Record<string, Point>, ids: readonly string[], kind: FormationKind, options: FormationOptions, mode: FormationAssignmentMode, assignmentRotation = options.rotation): string[] {
  return mode === 'shortest' ? shortestTravelOrder(positions, ids, generateFormation(kind, ids.length, options)) : formationAssignmentOrder(positions, ids, kind, { ...options, assignment: mode, rotation: assignmentRotation });
}

export function sessionLiveFormation(session: FormationSession): LiveFormation {
  const live = session.live!;
  return { ...(session.assignmentConstraints?{assignmentConstraints:session.assignmentConstraints}:{}), ...(session.scatter ? {scatter:session.scatter} : {}), ...(session.bezier ? {bezier:session.bezier} : {}), id: live.id, name: liveFormationName(live.name), kind: session.kind, options: { ...session.options, assignment: session.options.assignment ?? 'position' }, slotCount: live.slotCount,
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
    if (session.scatter && (!session.ids.length || session.scatterPending || session.scatterError)) return {positions:next,updates,changed:false,travel:null,error:!session.ids.length?'Select at least one scatter member.':session.scatterError??'Settings or membership changed. Regenerate the scatter before applying.'};
    validateProjectEdit(project,formationProject(project,session,next));
    const distances = Object.entries(updates).map(([id,p])=>Math.hypot(p.x-positions[id].x,p.y-positions[id].y));
    const original = project.sets.find(s=>s.id===session.setId)?.liveFormations?.find(s=>s.id===shape.id);
    return { positions:next,updates,changed:distances.some(d=>d>1e-9) || JSON.stringify(original)!==JSON.stringify(shape),error:null,travel:{total:distances.reduce((a,b)=>a+b,0),maximum:Math.max(0,...distances)} };
  } catch(error) { return { positions, updates:{}, changed:false,error:(error as Error).message,travel:null }; }
}
