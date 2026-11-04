import { validateProjectEdit } from '../domain';
import type { LiveFormation, PerformerPath, Project } from '../types';
import { canEditPositions } from './editMode';
import type { EditorState } from './state';

export interface TransitionControls { kind:'line'|'cubic'; bend:number; departure:number; arrival:number; stagger:number }
export interface TransitionMapping { performerId:string; sourceSlot:number; destinationSlot:number }
export type TransitionPathPolicy = {mode:'preserve'|'group'} | {mode:'custom';path:PerformerPath|null};
export interface FormationTransitionReview {
  revision:number; epoch:number; moveId:string; activeSetId:string; ids:string[];
  sourceId:string; destinationId:string; order:'source'|'destination'; mapping:TransitionMapping[];
  controls:TransitionControls; policies:Record<string,TransitionPathPolicy>;
}
const sameIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&new Set(a).size===a.length&&a.every(id=>b.includes(id));
export const savedTransitionPath=(project:Project,index:number,id:string)=>Object.hasOwn(project.moves[index].paths,id)?project.moves[index].paths[id]:undefined;

export function canReviewFormationTransition(state:EditorState):boolean {
  return !state.ui.dialog&&!state.ui.pendingDraft&&!state.project.transactionName&&!state.fileSession.fileOperation
    &&state.ui.workspace==='design'&&state.ui.view==='2d'&&canEditPositions(state)&&state.selection.activeIndex>0
    &&state.selection.selectedIds.length>=2&&state.selection.selectedIds.length<=500
    &&new Set(state.selection.selectedIds).size===state.selection.selectedIds.length
    &&state.selection.selectedIds.every(id=>state.project.present.performers.some(p=>p.id===id));
}
export function formationTransitionCurrent(state:EditorState,review:FormationTransitionReview):boolean {
  return state.ui.dialog==='formation-transition'&&review.revision===state.project.revision&&review.epoch===state.ui.projectEpoch
    &&review.activeSetId===state.project.present.sets[state.selection.activeIndex]?.id
    &&review.moveId===state.project.present.moves[state.selection.activeIndex-1]?.id
    &&sameIds(review.ids,state.selection.selectedIds)
    &&canReviewFormationTransition({...state,ui:{...state.ui,dialog:null}});
}
function endpoint(project:Project,index:number,id:string):LiveFormation {
  const shape=project.sets[index]?.liveFormations?.find(f=>f.id===id);
  if(!shape)throw Error('Choose an editable formation on each endpoint set. Apply a shape with Keep editable, or keep a saved parametric template editable.');
  return shape;
}
export function transitionMapping(project:Project,index:number,sourceId:string,destinationId:string,ids:readonly string[],order:'source'|'destination'):TransitionMapping[] {
  if(!project.moves[index]||!['source','destination'].includes(order))throw Error('Choose an existing incoming move and slot order.');
  if(ids.length<2||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!project.performers.some(p=>p.id===id)))throw Error('Select 2–500 existing performers exactly once.');
  const source=endpoint(project,index,sourceId),destination=endpoint(project,index+1,destinationId);
  const from=new Map(source.members.map(m=>[m.performerId,m.slot])),to=new Map(destination.members.map(m=>[m.performerId,m.slot]));
  if(ids.some(id=>!from.has(id)||!to.has(id)))throw Error('Every selected performer must belong to both chosen endpoint formations. Cancel to change the selection or prepare the endpoints.');
  return ids.map(performerId=>({performerId,sourceSlot:from.get(performerId)!,destinationSlot:to.get(performerId)!}))
    .sort((a,b)=>order==='source'?a.sourceSlot-b.sourceSlot:a.destinationSlot-b.destinationSlot);
}
export function beginFormationTransition(state:EditorState):FormationTransitionReview {
  const project=state.project.present,index=state.selection.activeIndex-1,ids=project.performers.filter(p=>state.selection.selectedIds.includes(p.id)).map(p=>p.id);
  const choose=(i:number)=>{const shapes=project.sets[i]?.liveFormations??[];return (shapes.find(f=>ids.every(id=>f.members.some(m=>m.performerId===id)))??shapes[0])?.id??'';};
  const sourceId=choose(index),destinationId=choose(index+1);let mapping:TransitionMapping[]=[];
  try{mapping=transitionMapping(project,index,sourceId,destinationId,ids,'source');}catch{/* The dialog explains missing endpoints. */}
  return {revision:state.project.revision,epoch:state.ui.projectEpoch,moveId:project.moves[index].id,activeSetId:project.sets[index+1].id,ids,sourceId,destinationId,order:'source',mapping,
    controls:{kind:'line',bend:0,departure:0,arrival:project.moves[index].counts,stagger:0},
    policies:Object.fromEntries(ids.map(id=>[id,{mode:savedTransitionPath(project,index,id)?'preserve':'group'}]))};
}
/** Materialize controls into existing path definitions. No endpoint coordinates,
 * shape membership, cast metadata, global timing or adjacent moves are edited. */
export function formationTransitionPlan(project:Project,review:FormationTransitionReview) {
  const index=project.moves.findIndex(m=>m.id===review.moveId);if(index<0||project.sets[index+1].id!==review.activeSetId)throw Error('The reviewed move or endpoint set changed.');
  const mapping=transitionMapping(project,index,review.sourceId,review.destinationId,review.ids,review.order);
  if(JSON.stringify(mapping)!==JSON.stringify(review.mapping))throw Error('The explicit member-to-slot mapping changed. Reopen the review.');
  const move=project.moves[index],c=review.controls;
  if(!c||!['line','cubic'].includes(c.kind)||![c.bend,c.departure,c.arrival,c.stagger].every(Number.isFinite)
    ||Math.abs(c.bend)>100||c.departure<0||c.arrival>move.counts||c.arrival<=c.departure||c.stagger<0||c.stagger>move.counts)
    throw Error('Use a valid travel kind, bend from −100 to 100 yd, and a positive departure/arrival window inside the move. Stagger must be nonnegative.');
  if(!review.policies||!sameIds(Object.keys(review.policies),review.ids))throw Error('Choose a path policy for every selected member only.');
  const paths={...move.paths};let controlled=0,preserved=0,custom=0,lastArrival=0;
  for(const [rank,{performerId:id}] of mapping.entries()) {
    const policy=review.policies[id];
    if(policy?.mode==='preserve'){preserved++;continue;}
    if(policy?.mode==='custom'){
      custom++;if(policy.path)paths[id]=structuredClone(policy.path);else delete paths[id];continue;
    }
    if(policy?.mode!=='group')throw Error('Choose Preserve, Group controls or Individual override for each selected member.');
    controlled++;const startCount=c.departure+rank*c.stagger,endCount=c.arrival+rank*c.stagger;
    if(endCount>move.counts)throw Error(`Stagger puts a controlled arrival at count ${endCount}; this move ends at ${move.counts}. Reduce stagger or the base arrival.`);
    lastArrival=Math.max(lastArrival,endCount);
    const from=project.sets[index].positions[id],to=project.sets[index+1].positions[id],dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
    if(c.kind==='line'&&startCount===0&&endCount===move.counts||length<1e-10){delete paths[id];continue;}
    const common={id:'formation-transition',startCount,endCount};
    paths[id]=c.kind==='line'?{segments:[{...common,kind:'line'}]}:{segments:[{...common,kind:'cubic',
      control1:{x:from.x+dx/3-dy/length*c.bend,y:from.y+dy/3+dx/length*c.bend},
      control2:{x:from.x+2*dx/3-dy/length*c.bend,y:from.y+2*dy/3+dx/length*c.bend}}]};
    const segment=paths[id]?.segments[0];
    if(segment?.kind==='cubic'&&[segment.control1,segment.control2].some(p=>p.x<0||p.x>project.field.width||p.y<0||p.y>project.field.height))
      throw Error('A curved control leaves the field. Reduce bend or use an individual override.');
  }
  const candidate={...project,moves:project.moves.map((m,i)=>i===index?{...m,paths}:m)};
  validateProjectEdit(project,candidate);
  return {project:candidate,index,mapping,controlled,preserved,custom,lastArrival,changed:JSON.stringify(move.paths)!==JSON.stringify(paths)};
}
