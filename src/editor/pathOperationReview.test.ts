import { describe,expect,it } from 'vitest';
import wire from '../../format/examples/scheduled-v6.squid?raw';
import { parseProject,serializeProject } from '../domain';
import { createEditorStore } from './store';
import { commandRegistry } from './commands';
import type { PathOperationRequest,PathCopyRequest } from './pathOperationReview';
function setup(){const p=parseProject(wire),store=createEditorStore(p);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',['a']);const s=store.getState();const context={moveId:p.moves[0].id,activeSetId:p.sets[1].id,ids:['a'],revision:s.project.revision,epoch:s.ui.projectEpoch};return{p,store,context};}
describe('reviewed path operation commands',()=>{
 it('resizes as one undo action and rejects stale review context without partial edits',()=>{
  const{p,store,context}=setup(),request:PathOperationRequest={...context,operation:{kind:'resize',counts:32}};
  for(const patch of [{revision:-1},{epoch:-1},{activeSetId:'missing'},{ids:[]}])expect(store.dispatch('path.operation-apply',{...request,...patch})).toBe(false);
  expect(store.dispatch('path.operation-apply',request)).toBe(true);expect(store.getState().project.past).toHaveLength(1);expect(store.getState().playback.count).toBe(32);
  store.dispatch('history.undo');expect(store.getState().project.present).toEqual(p);store.dispatch('history.redo');expect(parseProject(serializeProject(store.getState().project.present))).toEqual(store.getState().project.present);
 });
 it('copies without history or dirty revision, clones clipboard and clears it on project replacement',()=>{
  const{p,store,context}=setup(),request:PathCopyRequest={...context,performerId:'a',segmentIds:p.moves[0].paths.a.segments.map(s=>s.id),wholeMove:true};
  expect(store.dispatch('path.copy-intervals',request)).toBe(true);expect(store.getState().project.past).toHaveLength(0);expect(store.getState().project.revision).toBe(context.revision);expect(store.getState().ui.movementClipboard?.intervals).toHaveLength(3);
  store.dispatch('project.load',{project:p});expect(store.getState().ui.movementClipboard).toBeNull();
 });
 it('reverses atomically, preserves IDs and restores the full production with undo',()=>{
  const{p,store,context}=setup();expect(store.dispatch('path.operation-apply',{...context,operation:{kind:'reverse'}})).toBe(true);expect(store.getState().project.past).toHaveLength(1);store.dispatch('history.undo');expect(store.getState().project.present).toEqual(p);
  const s=store.getState();store.setValue('selection','selectedIds',[]);expect(store.dispatch('path.operation-apply',{...context,ids:[],revision:s.project.revision,operation:{kind:'reverse'}})).toBe(false);
 });
 it('allows move-level resizing from the opening without a performer selection but never reverses an empty selection',()=>{
  const{store}=setup();store.dispatch('set.select',{index:0});store.setValue('selection','selectedIds',[]);expect(commandRegistry['path.operations-open'].enabled(store.getState(),undefined)).toBe(true);
  const s=store.getState(),p=s.project.present;expect(store.dispatch('path.operation-apply',{moveId:p.moves[0].id,activeSetId:p.sets[0].id,ids:[],revision:s.project.revision,epoch:s.ui.projectEpoch,operation:{kind:'resize',counts:24}})).toBe(true);
 });
 it('rejects invalid reverse neighbors, overflow paste and unrepresentable rescaling without any partial history',()=>{
  const{p,store,context}=setup();const invalid=structuredClone(p);invalid.moves[1].paths.a={segments:[{id:'hold',kind:'hold',startCount:0,endCount:8}]};invalid.sets[2].positions.a={...invalid.sets[1].positions.a};store.dispatch('project.load',{project:invalid});store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',['a']);let s=store.getState();
  expect(store.dispatch('path.operation-apply',{...context,revision:s.project.revision,epoch:s.ui.projectEpoch,operation:{kind:'reverse'}})).toBe(false);expect(store.getState().project.present).toEqual(invalid);expect(store.getState().project.past).toHaveLength(0);
  const tiny=structuredClone(p);tiny.moves[0].paths.a={segments:[{id:'tiny',kind:'line',startCount:1e-323,endCount:2e-323}]};store.dispatch('project.load',{project:tiny});store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',['a']);s=store.getState();
  expect(store.dispatch('path.operation-apply',{...context,revision:s.project.revision,epoch:s.ui.projectEpoch,operation:{kind:'resize',counts:1}})).toBe(false);expect(store.getState().project.present).toEqual(tiny);expect(store.getState().project.past).toHaveLength(0);
 });
});
it('checks clipboard identity and explicit destination mapping before an atomic paste, including undo/reload',()=>{
 const{p,store,context}=setup();store.dispatch('path.copy-intervals',{...context,performerId:'a',segmentIds:['curve-a'],wholeMove:false});
 const clip=store.getState().ui.movementClipboard!;store.dispatch('set.select',{index:2});store.setValue('selection','selectedIds',['b']);
 const s=store.getState(),request:PathOperationRequest={moveId:p.moves[1].id,activeSetId:p.sets[2].id,ids:['b'],revision:s.project.revision,epoch:s.ui.projectEpoch,operation:{kind:'paste',clipboardId:clip.id,options:{performerId:'b',startCount:0,duration:8,frame:'fit',seed:'command',allowTargetTiming:true}}};
 if(request.operation.kind!=='paste')throw Error('fixture');
 expect(store.dispatch('path.operation-apply',{...request,operation:{...request.operation,clipboardId:'stale'}})).toBe(false);
 expect(store.dispatch('path.operation-apply',{...request,operation:{...request.operation,options:{...request.operation.options,performerId:'a'}}})).toBe(false);
 expect(store.getState().project.present).toEqual(p);expect(store.getState().project.past).toHaveLength(0);
 expect(store.dispatch('path.operation-apply',request)).toBe(true);const pasted=store.getState().project.present;expect(pasted.sets).toEqual(p.sets);expect(pasted.moves[1].paths.b.segments[0].id).toBe('paste-command-0');
 expect(parseProject(serializeProject(pasted))).toEqual(pasted);expect(store.getState().project.past).toHaveLength(1);store.dispatch('history.undo');expect(store.getState().project.present).toEqual(p);
});
