import { uid, validateProjectEdit } from '../domain';
import { effectiveMove, rescaleGroupMotions, validateGroupMotions } from '../groupMotion';
import type { GroupMotion, Project } from '../types';
import { canEditPositions } from './editMode';
import type { EditorState } from './state';

export interface GroupMotionReview {
  revision:number; epoch:number; moveId:string; activeSetId:string; selectedIds:string[];
  groupId:string; existing:boolean; group:GroupMotion|null; allowOverride:boolean;
  copy?:{moveId:string;groupId:string;fitCounts:boolean};
}
export function canOpenGroupMotion(state:EditorState,id?:string):boolean {
  return !state.ui.dialog&&!state.ui.pendingDraft&&!state.project.transactionName&&!state.fileSession.fileOperation
    &&state.ui.workspace==='design'&&state.ui.view==='2d'&&canEditPositions(state)&&state.selection.activeIndex>0
    &&new Set(state.selection.selectedIds).size===state.selection.selectedIds.length
    &&state.selection.selectedIds.every(id=>state.project.present.performers.some(p=>p.id===id))
    &&(id?!!state.project.present.moves[state.selection.activeIndex-1].groupMotions?.some(g=>g.id===id):state.selection.selectedIds.length>=2);
}
export function groupReviewCurrent(state:EditorState,r:GroupMotionReview):boolean {
  return state.ui.dialog==='group-motion'&&state.project.revision===r.revision&&state.ui.projectEpoch===r.epoch
    &&state.project.present.sets[state.selection.activeIndex]?.id===r.activeSetId
    &&state.project.present.moves[state.selection.activeIndex-1]?.id===r.moveId
    &&r.selectedIds.length===state.selection.selectedIds.length&&r.selectedIds.every(id=>state.selection.selectedIds.includes(id))
    &&!state.ui.pendingDraft&&!state.project.transactionName&&!state.fileSession.fileOperation&&state.ui.workspace==='design'&&state.ui.view==='2d'&&canEditPositions(state);
}
export function beginGroupMotion(state:EditorState,id?:string):GroupMotionReview {
  const project=state.project.present,index=state.selection.activeIndex-1,move=project.moves[index];
  const original=move.groupMotions?.find(g=>g.id===id);
  const members=project.performers.filter(p=>state.selection.selectedIds.includes(p.id)).map(p=>p.id);
  let n=1;while(move.groupMotions?.some(g=>g.name.toLowerCase()===`movement ${n}`))n++;
  const group:GroupMotion=original?structuredClone(original):{id:uid(),name:`Movement ${n}`,routeId:project.sharedRoutes?.[0]?.id??'',mode:'follow',members,phase:0,speed:1,delay:.5,interval:.1,offsetDirection:-1,entryCounts:Math.min(1,move.counts/4),exitCounts:Math.min(1,move.counts/4),endpointPolicy:'hold',cues:[{count:0,direction:1}]};
  return {revision:state.project.revision,epoch:state.ui.projectEpoch,moveId:move.id,activeSetId:project.sets[index+1].id,selectedIds:[...state.selection.selectedIds],groupId:group.id,existing:!!original,group,allowOverride:false};
}
export function groupMotionPlan(project:Project,request:GroupMotionReview) {
  const sourceIndex=project.moves.findIndex(m=>m.id===request.moveId);if(sourceIndex<0||project.sets[sourceIndex+1].id!==request.activeSetId)throw Error('The reviewed incoming move changed.');
  const source=project.moves[sourceIndex],original=source.groupMotions?.find(g=>g.id===request.groupId);
  if(!!original!==request.existing)throw Error('The reviewed group changed. Reopen Group movement.');
  if(request.group&&request.group.id!==request.groupId)throw Error('The group identity changed.');
  if(!request.group&&!original)throw Error('There is no saved group to remove.');
  let index=sourceIndex,group=request.group?structuredClone(request.group):null;
  if(request.copy){
    index=project.moves.findIndex(m=>m.id===request.copy!.moveId);
    if(index<0||index===sourceIndex||!group)throw Error('Choose another move for the reviewed group copy.');
    if(request.copy.fitCounts)group=rescaleGroupMotions([group],source.counts,project.moves[index].counts)![0];
    group={...group,id:request.copy.groupId};
    if(project.moves[index].groupMotions?.some(g=>g.id===group!.id))throw Error('The copy identity is already used. Reopen the review.');
    const names=new Set(project.moves[index].groupMotions?.map(g=>g.name.toLowerCase()));let n=1,name=group.name;
    while(names.has(name.toLowerCase())){const suffix=` copy ${n++}`;name=group.name.slice(0,80-suffix.length)+suffix;}group.name=name;
  }
  const move=project.moves[index],existing=request.copy?undefined:original;
  const groups=existing?(move.groupMotions??[]).flatMap(g=>g.id===existing.id?(group?[group]:[]):[g]):[...(move.groupMotions??[]),...(group?[group]:[])];
  const checked=validateGroupMotions(groups,project,index);
  if(group&&!request.allowOverride&&group.members.some(id=>Object.hasOwn(move.paths,id)))throw Error('Review and allow the group to override saved individual paths. They remain stored and return when a member leaves the group.');
  const next:Project={...project,moves:project.moves.map((m,i)=>{
    if(i!==index)return m;const {groupMotions:_groups,...base}=m;return checked?{...base,groupMotions:checked}:base;
  })};
  validateProjectEdit(project,next);const effective=effectiveMove(next,index);
  const ids=[...new Set([...(existing?.members??[]),...(group?.members??[])])];
  return {project:next,index,ids,group:group?checked!.find(g=>g.id===group!.id)!:null,
    pieces:ids.reduce((sum,id)=>sum+(effective.paths[id]?.segments.length??0),0),changed:JSON.stringify(move.groupMotions??[])!==JSON.stringify(checked??[])};
}
