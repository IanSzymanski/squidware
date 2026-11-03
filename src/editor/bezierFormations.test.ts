import { describe, expect, it } from 'vitest';
import { bezierFormationPoints, bezierPreset, bezierRoute, deleteBezierAnchor, insertBezierAnchor, moveBezierPoint, setBezierMode, validateBezierFormation } from '../bezierFormations';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';
import type { BezierFormation, Point } from '../types';

const field=createDemoProject().field;
const preset=()=>bezierPreset({x:50,y:25},true,field);
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Independent dense integration of the polynomial; never uses route sampling. */
function reference(shape:BezierFormation,count:number) {
  const points:Point[]=[shape.anchors[0].point],lengths=[0];let total=0;
  for(let i=1;i<shape.anchors.length;i++) {
    const a=shape.anchors[i-1],b=shape.anchors[i];
    for(let j=1;j<=10000;j++) {
      const t=j/10000,u=1-t,p={x:u*u*u*a.point.x+3*u*u*t*a.outgoing.x+3*u*t*t*b.incoming.x+t*t*t*b.point.x,y:u*u*u*a.point.y+3*u*u*t*a.outgoing.y+3*u*t*t*b.incoming.y+t*t*t*b.point.y};
      total+=distance(points.at(-1)!,p);points.push(p);lengths.push(total);
    }
  }
  let cursor=0;
  return Array.from({length:count},(_,i)=>{const target=total*i/(count-1);while(cursor<lengths.length-1&&lengths[cursor]<target)cursor++;return points[cursor];});
}
describe('editable Bézier formation geometry',()=>{
  it('spaces slots by arc length on uneven curvature and includes exact endpoints',()=>{
    const shape=preset();shape.anchors[0].outgoing={x:36,y:4};shape.anchors[1].incoming={x:64,y:48};
    const actual=bezierFormationPoints(shape,64),expected=reference(shape,64);
    actual.forEach((p,i)=>expect(distance(p,expected[i])).toBeLessThan(.006));
    expect(actual[0]).toEqual(shape.anchors[0].point);expect(actual.at(-1)).toEqual(shape.anchors.at(-1)!.point);
    const line=preset();line.anchors[0].outgoing={x:36,y:25};line.anchors[1].incoming={x:37,y:25};
    bezierFormationPoints(line,11).forEach((p,i)=>expect(distance(p,{x:35+i*3,y:25})).toBeLessThan(.002));
  });
  it('splits exactly, preserves IDs and preserves locus across repeated splits',()=>{
    const before=preset(),split=insertBezierAnchor(insertBezierAnchor(before,0,'middle'),0,'quarter');
    expect(split.anchors.map(a=>a.id)).toEqual(['anchor-start','quarter','middle','anchor-end']);
    const original=bezierFormationPoints(before,500),actual=bezierFormationPoints(split,500);
    actual.forEach((p,i)=>expect(distance(p,original[i])).toBeLessThan(.002));
    expect(validateBezierFormation(split,field)).toEqual(split);
  });
  it('honors smooth and symmetric joins, zero handles, corner independence and anchor translation',()=>{
    let shape=insertBezierAnchor(preset(),0,'middle');const a=shape.anchors[1],originalLength=distance(a.incoming,a.point);
    shape=moveBezierPoint(shape,a.id,'outgoing',{x:55,y:20});
    expect(distance(shape.anchors[1].incoming,a.point)).toBeCloseTo(originalLength,8);
    shape=setBezierMode(shape,a.id,'symmetric');
    expect(distance(shape.anchors[1].incoming,a.point)).toBeCloseTo(distance(shape.anchors[1].outgoing,a.point),8);
    expect(validateBezierFormation(shape,field)).toEqual(shape);
    shape=moveBezierPoint(shape,a.id,'outgoing',a.point);expect(shape.anchors[1].incoming).toEqual(a.point);
    shape=setBezierMode(shape,a.id,'corner');const old=shape.anchors[1].incoming;
    shape=moveBezierPoint(shape,a.id,'outgoing',{x:55,y:20});expect(shape.anchors[1].incoming).toEqual(old);
    const moved=moveBezierPoint(shape,a.id,'point',{x:a.point.x+2,y:a.point.y+3});
    expect(moved.anchors[1].outgoing).toEqual({x:57,y:23});
  });
  it('rejects malformed, degenerate, out-of-field, inconsistent joins and bounded-work violations',()=>{
    expect(()=>deleteBezierAnchor(preset(),'anchor-start')).toThrow(/two anchors/);
    for(const edit of [(s:BezierFormation)=>s.anchors.pop(),(s:BezierFormation)=>s.anchors[1].id=s.anchors[0].id,(s:BezierFormation)=>s.anchors[0].outgoing.x=NaN,(s:BezierFormation)=>s.anchors[0].incoming.x=-1,(s:BezierFormation)=>s.anchors=Array(34).fill(s.anchors[0])]) {
      const s=preset();edit(s);expect(()=>validateBezierFormation(s,field)).toThrow();
    }
    const zero=preset();zero.anchors=zero.anchors.map(a=>({...a,point:{x:50,y:25},incoming:{x:50,y:25},outgoing:{x:50,y:25}}));expect(()=>validateBezierFormation(zero,field)).toThrow(/0.01/);
    const bad=insertBezierAnchor(preset(),0,'middle');bad.anchors[1].mode='symmetric';bad.anchors[1].incoming={x:30,y:20};expect(()=>validateBezierFormation(bad,field)).toThrow();
    for(const count of [0,1,501])expect(()=>bezierFormationPoints(preset(),count)).toThrow(/2–500/);
  });
});

function setup(count=4) {
  const project=createDemoProject(),store=createEditorStore(project),ids=project.performers.slice(0,count).map(p=>p.id);
  store.setValue('selection','selectedIds',ids);expect(store.dispatch('formation.bezier',{wave:true})).toBe(true);
  return {project,store,ids};
}
describe('Bézier formation editor transactions and persistence',()=>{
  it('previews only explicit members; cancel leaves history untouched; Apply/undo/reload retain exact editable geometry',()=>{
    const {project,store,ids}=setup();const initial=store.getState().project.present;
    expect(store.getState().project.past).toHaveLength(0);
    const session=store.getState().ui.formationPreview!,order=[...session.order!];
    store.dispatch('formation.bezier-update',{bezier:insertBezierAnchor(session.bezier!,0,'middle')});
    expect(store.getState().ui.formationPreview!.order).toEqual(order);
    store.dispatch('formation.cancel');expect(store.getState().project.present).toBe(initial);
    store.dispatch('formation.bezier',{wave:true});const result=currentFormationResult(store.getState())!;
    expect(result.error).toBeNull();expect(store.dispatch('formation.apply')).toBe(true);
    const accepted=store.getState().project.present;
    expect(store.getState().project.past).toHaveLength(1);
    for(const p of project.performers.filter(p=>!ids.includes(p.id)))expect(accepted.sets[0].positions[p.id]).toEqual(initial.sets[0].positions[p.id]);
    expect(accepted.moves).toEqual(initial.moves);
    const wire=serializeProject(accepted);expect(JSON.parse(wire).schemaVersion).toBe(9);expect(parseProject(wire)).toEqual(accepted);
    const old=JSON.parse(wire);old.schemaVersion=8;expect(()=>parseProject(JSON.stringify(old))).toThrow(/version 9/);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(initial);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(accepted);
    const shape=accepted.sets[0].liveFormations![0];store.dispatch('live.edit',{id:shape.id});expect(currentFormationResult(store.getState())!.changed).toBe(false);
    expect(store.getState().ui.formationPreview!.bezier).toEqual(shape.bezier);
    store.dispatch('formation.cancel');store.dispatch('live.copy',{id:shape.id,targetSetId:project.sets[1].id});expect(store.getState().ui.formationPreview!.bezier).toEqual(shape.bezier);
    expect(store.dispatch('formation.apply')).toBe(true);expect(store.getState().project.present.sets[0]).toEqual(accepted.sets[0]);
  });
  it('retains vacant slots after individual overrides, explicitly redistributes and preserves geometry after copy and membership changes',()=>{
    const {store,ids}=setup();store.dispatch('formation.apply');const accepted=store.getState().project.present,shape=accepted.sets[0].liveFormations![0];
    store.dispatch('positions.move',{index:0,updates:{[ids[1]]:{x:5,y:5}}});
    const detached=store.getState().project.present.sets[0].liveFormations![0];expect(detached.slotCount).toBe(4);expect(detached.members).toHaveLength(3);
    store.dispatch('live.edit',{id:shape.id});expect(currentFormationResult(store.getState())!.changed).toBe(false);
    store.dispatch('live.redistribute');expect(store.getState().ui.formationPreview!.live!.slotCount).toBe(3);store.dispatch('formation.apply');
    const after=store.getState().project.present;expect(after.sets[0].positions[ids[1]]).toEqual({x:5,y:5});expect(after.sets[0].liveFormations![0].bezier).toEqual(shape.bezier);
    expect(parseProject(serializeProject(after))).toEqual(after);
  });
  it('rejects empty/one-member creation and stale previews; respects pending numeric drafts',()=>{
    const {store}=setup();store.dispatch('formation.cancel');store.setValue('selection','selectedIds',[]);expect(store.dispatch('formation.bezier',{wave:true})).toBe(false);
    store.setValue('selection','selectedIds',[store.getState().project.present.performers[0].id]);expect(store.dispatch('formation.bezier',{wave:true})).toBe(false);
    const {store:s}=setup();s.setValue('ui','pendingDraft',true);expect(s.dispatch('formation.apply')).toBe(false);expect(s.dispatch('formation.bezier-update',{bezier:preset()})).toBe(false);
    s.setValue('ui','pendingDraft',false);s.setValue('selection','selectedIds',[]);expect(s.dispatch('formation.apply')).toBe(false);
  });
  it.each([2,64,500])('supports %i stable slots without conflating geometry and travel',count=>{
    const points=bezierFormationPoints(preset(),count);expect(points).toHaveLength(count);points.forEach(p=>expect(Number.isFinite(p.x+p.y)).toBe(true));
    expect(bezierRoute(preset()).closed).toBe(false);
    const project=createPerformanceFixture('maximum');project.performers=project.performers.slice(0,count);
    project.sets=project.sets.slice(0,2).map(s=>({...s,positions:Object.fromEntries(project.performers.map(p=>[p.id,s.positions[p.id]]))}));project.moves=project.moves.slice(0,1);
    const store=createEditorStore(project);store.setValue('selection','selectedIds',project.performers.map(p=>p.id));
    expect(store.dispatch('formation.bezier',{wave:true})).toBe(true);expect(currentFormationResult(store.getState())!.error).toBeNull();expect(store.dispatch('formation.apply')).toBe(true);
    const accepted=store.getState().project.present;expect(parseProject(serializeProject(accepted))).toEqual(accepted);
    expect(accepted.sets[0].liveFormations![0].members).toHaveLength(count);
  });
});
