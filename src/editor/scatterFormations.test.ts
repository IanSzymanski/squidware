import { describe, expect, it } from 'vitest';
import { generateScatter, scatterArea, scatterContains, scatterPreset, validateScatterFormation, validateScatterSettings } from '../scatterFormations';
import { analyzeTransition, createDemoProject, parseProject, serializeProject } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { createEditorStore } from './store';
import { currentFormationResult, formationProject } from './formationSession';
import { neighborOverlays } from '../neighborPaths';
import { sampleMovement } from '../movementPaths';
import type { Point, ScatterSettings } from '../types';

const field=createDemoProject().field;
const settings=()=>scatterPreset({x:50,y:25},field);
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function check(points:Point[],spacing:number,region:ScatterSettings['region']) {
  points.forEach((p,i)=>{expect(scatterContains(region,p)).toBe(true);for(let j=0;j<i;j++)expect(distance(p,points[j])+1e-8).toBeGreaterThanOrEqual(spacing);});
}
describe('bounded seeded scatter generation',()=>{
  it.each(['rectangle','ellipse','polygon'] as const)('repeats a seed in %s and respects pins, region and spacing',kind=>{
    const s=settings();s.region={kind,vertices:kind==='polygon'?[{x:20,y:10},{x:80,y:10},{x:80,y:20},{x:50,y:20},{x:50,y:40},{x:20,y:40}]:[{x:20,y:10},{x:80,y:40}]};
    const pins={0:{x:35,y:25},31:{x:40,y:25}};
    const generated=generateScatter(s,64,pins,field);expect(generateScatter(s,64,pins,field)).toEqual(generated);
    check(generated.points,s.minimumSpacing,s.region);expect(generated.points[0]).toEqual(pins[0]);expect(generated.points[31]).toEqual(pins[31]);
    expect(validateScatterFormation(generated,64,field)).toEqual(generated);
    const reroll=generateScatter({...s,seed:'another-seed'},64,pins,field);expect(reroll.points).not.toEqual(generated.points);expect(reroll.points[0]).toEqual(pins[0]);
  });
  it('distinguishes clustered density while retaining the exact minimum spacing',()=>{
    const s=settings(),uniform=generateScatter({...s,minimumSpacing:.3},200,{},field),clustered=generateScatter({...s,minimumSpacing:.3,distribution:'clustered',clusterStrength:1},200,{},field);
    const nearest=(points:Point[])=>points.reduce((sum,p,i)=>sum+Math.min(...points.filter((_,j)=>j!==i).map(q=>distance(p,q))),0)/points.length;
    expect(nearest(clustered.points)).toBeLessThan(nearest(uniform.points)*.8);check(clustered.points,.3,s.region);
  });
  it('rejects impossible requests, conflicting/outside pins and invalid input without mutating inputs',()=>{
    const s=settings(),before=structuredClone(s);
    expect(()=>generateScatter({...s,minimumSpacing:100},2,{},field)).toThrow(/No partial arrangement/);expect(s).toEqual(before);
    expect(()=>generateScatter(s,4,{0:{x:40,y:20},1:{x:40,y:20}},field)).toThrow(/pinned dots conflict/);
    expect(()=>generateScatter(s,4,{0:{x:1,y:1}},field)).toThrow(/pinned dot is outside/);
    for(const count of [0,501,1.5])expect(()=>generateScatter(s,count,{},field)).toThrow(/select 1–500/);
    for(const patch of [{seed:''},{version:2},{minimumSpacing:NaN},{clusterStrength:2},{distribution:'random'},{region:{kind:'rectangle',vertices:[{x:2,y:2},{x:2,y:20}]}},{region:{kind:'polygon',vertices:[{x:10,y:10},{x:30,y:30},{x:10,y:30},{x:30,y:10}]}}])expect(()=>validateScatterSettings({...s,...patch},field)).toThrow(/scatter/i);
  });
  it('handles boundary points, narrow/concave polygons and malformed serialized arrangements',()=>{
    const s=settings();expect(scatterContains(s.region,s.region.vertices[0])).toBe(true);expect(scatterArea(s.region)).toBe(1200);
    const ellipse={kind:'ellipse' as const,vertices:[{x:30,y:10},{x:70,y:40}]};
    expect(scatterContains(ellipse,{x:50+20*Math.SQRT1_2*(1+5e-9),y:25+15*Math.SQRT1_2*(1+5e-9)})).toBe(false);
    expect(scatterContains(ellipse,{x:50+20*Math.SQRT1_2*(1+1e-11),y:25+15*Math.SQRT1_2*(1+1e-11)})).toBe(true);
    const tinyTriangle={kind:'polygon' as const,vertices:[{x:10,y:10},{x:10.1,y:10},{x:10,y:10.1}]};
    expect(scatterContains(tinyTriangle,{x:10.05000005,y:10.05000005})).toBe(false);
    expect(scatterContains(tinyTriangle,{x:10.0500000001,y:10.0500000001})).toBe(true);

    s.region={kind:'polygon',vertices:[{x:10,y:10},{x:30,y:10},{x:30,y:11},{x:11,y:11},{x:11,y:30},{x:10,y:30}]};
    const generated=generateScatter({...s,minimumSpacing:.4},64,{},field);check(generated.points,.4,s.region);expect(scatterContains(s.region,{x:20,y:20})).toBe(false);
    for(const edit of [(v:typeof generated)=>v.points.pop(),(v:typeof generated)=>v.points[0]={x:20,y:20},(v:typeof generated)=>v.points[1]=v.points[0],(v:typeof generated)=>v.pinnedSlots=[0,0],(v:typeof generated)=>v.pinnedSlots=[500]]){const bad=structuredClone(generated);edit(bad);expect(()=>validateScatterFormation(bad,64,field)).toThrow();}
  });
});
function setup(count=4) {
  const project=createDemoProject(),store=createEditorStore(project),ids=project.performers.slice(0,count).map(p=>p.id);
  store.setValue('selection','selectedIds',ids);expect(store.dispatch('formation.scatter')).toBe(true);
  return {project,store,ids};
}
describe('scatter preview, membership and file transactions',()=>{
  it('requires explicit regeneration, cancels without history changes and persists accepted stored dots in v10',()=>{
    const {project,store}=setup();const session=store.getState().ui.formationPreview!,before=structuredClone(session.scatter!);
    store.dispatch('scatter.update',{settings:{...before,seed:'edited'}});
    expect(store.getState().ui.formationPreview!.scatter!.points).toEqual(before.points);expect(store.dispatch('formation.apply')).toBe(false);expect(store.getState().project.present).toEqual(project);
    expect(store.dispatch('scatter.regenerate',{})).toBe(true);expect(currentFormationResult(store.getState())!.error).toBeNull();
    expect(store.dispatch('formation.apply')).toBe(true);const accepted=store.getState().project.present;
    expect(store.getState().project.past).toHaveLength(1);expect(accepted.moves).toEqual(project.moves);
    const wire=serializeProject(accepted);expect(JSON.parse(wire).schemaVersion).toBe(10);expect(parseProject(wire)).toEqual(accepted);
    const older=JSON.parse(wire);older.schemaVersion=9;expect(()=>parseProject(JSON.stringify(older))).toThrow(/requires schema version 10/);
    store.dispatch('history.undo');expect(store.getState().project.present).toEqual(project);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(accepted);
    const shape=accepted.sets[0].liveFormations![0];store.dispatch('live.edit',{id:shape.id});expect(currentFormationResult(store.getState())!.changed).toBe(false);
    store.dispatch('scatter.update',{settings:{...shape.scatter!,minimumSpacing:100}});expect(store.dispatch('scatter.regenerate',{})).toBe(false);expect(store.dispatch('formation.apply')).toBe(false);
    expect(store.getState().project.present).toEqual(accepted);store.dispatch('formation.cancel');expect(store.getState().project.present).toEqual(accepted);
  });
  it('carries pins with member identities on reassignment, membership changes and reroll; ordinary dot edits detach only that member',()=>{
    const {store,ids}=setup();let session=store.getState().ui.formationPreview!,slot=session.live!.slots[0],pinnedId=session.order![0],point=session.scatter!.points[slot];
    store.dispatch('scatter.pin',{slot,pinned:true});store.dispatch('scatter.regenerate',{reroll:true});expect(store.getState().ui.formationPreview!.scatter!.points[slot]).toEqual(point);
    store.dispatch('formation.update',{options:{...session.options,assignment:'roster'}});expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('live.members',{ids:[...ids,store.getState().project.present.performers[10].id]});session=store.getState().ui.formationPreview!;
    const nextSlot=session.live!.slots[session.order!.indexOf(pinnedId)];expect(session.scatter!.pinnedSlots).toContain(nextSlot);expect(session.scatter!.points[nextSlot]).toEqual(point);
    expect(store.dispatch('scatter.regenerate',{})).toBe(true);expect(store.dispatch('formation.apply')).toBe(true);
    const shape=store.getState().project.present.sets[0].liveFormations![0];
    store.dispatch('positions.move',{index:0,updates:{[pinnedId]:{x:1,y:1}}});const after=store.getState().project.present;
    expect(after.sets[0].liveFormations![0].slotCount).toBe(5);expect(after.sets[0].liveFormations![0].scatter!.pinnedSlots).not.toContain(nextSlot);
    expect(after.sets[0].liveFormations![0].members).toHaveLength(4);expect(parseProject(serializeProject(after))).toEqual(after);
    store.dispatch('live.edit',{id:shape.id});store.dispatch('live.redistribute');expect(store.dispatch('formation.apply')).toBe(false);expect(store.dispatch('scatter.regenerate',{})).toBe(true);expect(store.dispatch('formation.apply')).toBe(true);
    expect(store.getState().project.present.sets[0].positions[pinnedId]).toEqual({x:1,y:1});
  });
  it('keeps numeric dot overrides, pinned positions, canceled gestures and copied geometry without regenerating on reload',()=>{
    const {project,store}=setup();let session=store.getState().ui.formationPreview!,scatter=session.scatter!;
    const override=generateScatter({...scatter,seed:'override'},4,{},field).points.find(p=>scatter.points.slice(1).every(q=>distance(p,q)>scatter.minimumSpacing))!;
    expect(store.dispatch('scatter.point',{slot:0,point:override})).toBe(true);store.dispatch('scatter.pin',{slot:0,pinned:true});
    expect(store.dispatch('scatter.regenerate',{reroll:true})).toBe(true);session=store.getState().ui.formationPreview!;scatter=session.scatter!;
    expect(scatter.points[0]).toEqual(override);const original=structuredClone(scatter);
    store.dispatch('scatter.update',{settings:{...scatter,region:{...scatter.region,vertices:[{x:20,y:5},{x:90,y:50}]}}});
    store.dispatch('scatter.restore',{scatter:original,pending:false});expect(store.getState().ui.formationPreview!.scatter).toEqual(original);expect(store.dispatch('formation.apply')).toBe(true);
    const accepted=store.getState().project.present,shape=accepted.sets[0].liveFormations![0];
    expect(parseProject(serializeProject(accepted)).sets[0].liveFormations![0].scatter!.points[0]).toEqual(override);
    store.dispatch('live.copy',{id:shape.id,targetSetId:project.sets[1].id});expect(currentFormationResult(store.getState())!.error).toBeNull();expect(store.getState().ui.formationPreview!.scatter).toEqual(scatter);
    store.dispatch('formation.apply');expect(store.getState().project.present.sets[0]).toEqual(accepted.sets[0]);
  });
  it('uses the accepted preview endpoints in shared entry/exit path samples and spacing/stride analysis',()=>{
    const {project,store,ids}=setup();store.dispatch('formation.cancel');store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',ids);store.dispatch('formation.scatter');
    const session=store.getState().ui.formationPreview!,result=currentFormationResult(store.getState())!,preview=formationProject(project,session,result.positions);
    const paths=neighborOverlays(preview,1,{previous:true,next:true,selectedIds:ids,sectionFilter:'all',preview:false});expect(paths).toHaveLength(2);
    expect(paths[0].paths[0].to).toEqual(result.positions[paths[0].paths[0].performerId]);expect(paths[1].paths[0].from).toEqual(result.positions[paths[1].paths[0].performerId]);
    const issues=[...analyzeTransition(preview,1),...analyzeTransition(preview,2)];expect(issues.length).toBeGreaterThan(0);
    store.dispatch('formation.apply');const accepted=store.getState().project.present;expect(analyzeTransition(accepted,1)).toEqual(analyzeTransition(preview,1));
    const id=ids[0],move=accepted.moves[0];expect(sampleMovement(accepted.sets[0].positions[id],accepted.sets[1].positions[id],move.paths[id],move.counts,move.counts)).toEqual(result.positions[id]);
  });
  it('guards empty selections, stale previews, pending input and failed overrides without project edits',()=>{
    const {project,store}=setup();const session=store.getState().ui.formationPreview!;
    expect(store.dispatch('scatter.point',{slot:0,point:session.scatter!.points[1]})).toBe(false);expect(store.getState().project.present).toEqual(project);
    store.setValue('ui','pendingDraft',true);expect(store.dispatch('scatter.regenerate',{})).toBe(false);expect(store.dispatch('formation.apply')).toBe(false);
    store.setValue('ui','pendingDraft',false);store.dispatch('live.members',{ids:[]});expect(store.dispatch('formation.apply')).toBe(false);expect(store.dispatch('scatter.regenerate',{})).toBe(false);
    store.dispatch('formation.cancel');expect(store.dispatch('formation.scatter')).toBe(false);
  });
  it.each([2,64,500])('applies %i members with valid spacing, identity, history and file round trips',count=>{
    const project=createPerformanceFixture('maximum');project.performers=project.performers.slice(0,count);project.sets=project.sets.slice(0,2).map(s=>({...s,positions:Object.fromEntries(project.performers.map(p=>[p.id,s.positions[p.id]]))}));project.moves=project.moves.slice(0,1);
    const store=createEditorStore(project);store.setValue('selection','selectedIds',project.performers.map(p=>p.id));expect(store.dispatch('formation.scatter')).toBe(true);expect(currentFormationResult(store.getState())!.error).toBeNull();expect(store.dispatch('formation.apply')).toBe(true);
    const accepted=store.getState().project.present,scatter=accepted.sets[0].liveFormations![0].scatter!;
    check(scatter.points,scatter.minimumSpacing,scatter.region);expect(accepted.performers).toEqual(project.performers);expect(parseProject(serializeProject(accepted))).toEqual(accepted);expect(store.getState().project.past).toHaveLength(1);
  });
});
