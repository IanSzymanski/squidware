import { emptyAssignmentConstraints, hasAssignmentConstraints, validateAssignmentConstraints } from '../assignmentConstraints';
import { assignmentProblem, mappingEligible } from '../assignmentOptimization';
import { uid, validateProjectEdit } from '../domain';
import { uniqueLiveName } from '../liveFormations';
import type { AssignmentConstraints } from '../types';
import type { EditorState } from './state';
import { formationProject, formationSessionCurrent, previewFormationSession } from './formationSession';

export interface AssignmentAcceptance {revision:number;epoch:number;signature:string;constraints:AssignmentConstraints;order:string[]}
export function assignmentReviewCurrent(state:EditorState,review:Pick<AssignmentAcceptance,'revision'|'epoch'|'signature'>):boolean {
  return state.ui.dialog==='assignment'&&!state.ui.pendingDraft&&review.revision===state.project.revision&&review.epoch===state.ui.projectEpoch&&review.signature===JSON.stringify(state.ui.formationPreview)
    &&formationSessionCurrent({...state,ui:{...state.ui,dialog:null}});
}
export function acceptedAssignment(state:EditorState,review:AssignmentAcceptance) {
  if(!assignmentReviewCurrent(state,review))throw Error('The formation or production changed. Cancel and reopen Optimize assignment.');
  const session=state.ui.formationPreview!,problem=assignmentProblem(state.project.present,session,state.ui.projectEpoch);
  const constraints=validateAssignmentConstraints(review.constraints,session.ids,problem.slotCount,problem.sectionIds);
  if(!mappingEligible(problem,constraints,review.order))throw Error('This mapping violates a pin, ordered group, prohibited pairing or section/role restriction. Compute a valid proposal.');
  const existing=state.project.present.sets[state.selection.activeIndex].liveFormations??[];
  const stored=hasAssignmentConstraints(constraints)?constraints:undefined;
  const next={...session,order:[...review.order],assignmentReviewed:true,assignmentConstraints:stored,live:session.live??(stored?{id:uid(),name:uniqueLiveName(existing),slotCount:session.ids.length,slots:session.ids.map((_,i)=>i)}:undefined)};
  const result=previewFormationSession(state.project.present,next);if(result.error)throw Error(result.error);
  validateProjectEdit(state.project.present,formationProject(state.project.present,next,result.positions));
  return next;
}
export function defaultAssignmentConstraints(state:EditorState):AssignmentConstraints {
  const session=state.ui.formationPreview!;if(session.assignmentConstraints)return structuredClone(session.assignmentConstraints);
  const problem=assignmentProblem(state.project.present,session,state.ui.projectEpoch),people=new Map(problem.performers.map(p=>[p.id,p]));
  return {...emptyAssignmentConstraints(),sectionSlots:problem.slots.map(s=>({slot:s.slot,sectionId:people.get(s.ownerId)!.sectionId}))};
}
