import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, sampleProject, serializeProject, validateProject, validateProjectEdit, performerMoveOutput } from './domain';
import { effectiveMove, groupMemberPath, groupRoute, leaderDistance, memberDistance, reverseGroupMotion, validateGroupMotions } from './groupMotion';
import type { GroupMotion, SharedRoute } from './types';
import { compileRoute } from './sharedRoutes';
import { transitionInput } from './analysis/input';
import { TransitionAnalyzer } from './analysis/engine';
import { compileTrack, curvePoint } from './analysis/detailed';
import { updateSetProperties, createPicture } from './editor/projectEdits';
import { copyIntervals, reversePaths } from './movementPathOperations';
import { editSharedRoute } from './editor/routeEditing';
import { editMovementSchedule } from './editor/movementScheduleEditing';
import { createEditorStore } from './editor/store';

function setup(mode:GroupMotion['mode']='follow',count=3,closed=false) {
  const project=createDemoProject();project.performers=Array.from({length:count},(_,i)=>({id:'p'+i,label:'P'+(i+1),name:'',sectionId:project.sections[0].id}));
  project.sets=project.sets.slice(0,2).map(s=>({...s,positions:Object.fromEntries(project.performers.map(p=>[p.id,{x:30,y:10}]))}));project.moves=[{...project.moves[0],counts:16,transition:'ease',paths:{}}];
  const route:SharedRoute=closed?{id:'route',name:'Loop',closed:true,start:{x:10,y:10},segments:[{id:'s0',kind:'line',to:{x:30,y:10}},{id:'s1',kind:'line',to:{x:30,y:30}},{id:'s2',kind:'line',to:{x:10,y:30}},{id:'s3',kind:'line',to:{x:10,y:10}}]}:{id:'route',name:'Open',closed:false,start:{x:10,y:10},segments:[{id:'s0',kind:'line',to:{x:90,y:10}}]};
  project.sharedRoutes=[route];
  const group:GroupMotion={id:'g',name:'Group',routeId:'route',mode,members:project.performers.map(p=>p.id),phase:20,speed:2,delay:1,interval:.1,offsetDirection:-1,entryCounts:0,exitCounts:0,endpointPolicy:'reject',cues:mode==='countermarch'?[{count:0,direction:1},{count:8,direction:-1}]:[{count:0,direction:1}]};
  project.moves[0].groupMotions=[group];
  const endpoints=()=>{const route=project.sharedRoutes![0],c=compileRoute(route),duration=16-group.entryCounts-group.exitCounts;for(const [i,id] of group.members.entries()){project.sets[0].positions[id]=c.atDistance(memberDistance(group,i,0));project.sets[1].positions[id]=c.atDistance(memberDistance(group,i,duration));}};
  endpoints();return {project,route,group,endpoints};
}
const close=(a:{x:number;y:number},b:{x:number;y:number},tolerance=1e-7)=>expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeLessThan(tolerance);

describe('shared group movement',()=>{
  it('follows straight leaders by count delay, independent of global easing, scrubbing order and reload',()=>{
    const {project,group}=setup();const p=validateProject(project),before=structuredClone(p),loaded=parseProject(serializeProject(p));
    expect(JSON.parse(serializeProject(p)).schemaVersion).toBe(12);expect(loaded).toEqual(p);
    for(const count of [0,16,7.25,.125,15.99,4,7.25])for(let i=0;i<3;i++){
      close(sampleProject(p,count).positions['p'+i],{x:30+2*(count-i),y:10});expect(sampleProject(loaded,count)).toEqual(sampleProject(p,count));
    }
    expect(p).toEqual(before);expect(group.members).toEqual(['p0','p1','p2']);expect(p.moves[0].paths).toEqual({});
    expect(performerMoveOutput(p,1,'p1').description).toContain('follow');
  });
  it('reproduces S-curve route samples at exact delays and exposes the identical polynomial to analysis',()=>{
    const {project,route,group,endpoints}=setup();route.segments=[{id:'s',kind:'cubic',to:{x:90,y:30},control1:{x:20,y:45},control2:{x:80,y:0}}];group.phase=10;group.speed=3;group.delay=.75;endpoints();const p=validateProject(project),move=effectiveMove(p,0),input=transitionInput(p,1,0)!;
    for(const t of [0,.125,1,4.125,8,15.99,16])for(let rank=0;rank<3;rank++){
      const id='p'+rank,expected=groupRoute(p.sharedRoutes![0]).atDistance(10+3*(t-rank*.75));close(sampleProject(p,t).positions[id],expected);
      const track=input.tracks[rank],compiled=compileTrack(track,16,'ease'),part=compiled.parts.find(s=>s.start<=t&&s.end>=t)!;
      close(curvePoint(part.points,(t-part.start)/(part.end-part.start)),expected);expect(move.paths[id].linearCounts).toBe(true);
    }
    expect(move.paths.p0.segments.length).toBeGreaterThan(32);
  });
  it('keeps fixed arc intervals through positive and negative loop seams for multiple laps',()=>{
    const {project,group,endpoints}=setup('conveyor',4,true);group.phase=0;group.speed=10;group.interval=20;group.offsetDirection=1;endpoints();const p=validateProject(project);
    function analytic(d:number){d=((d%80)+80)%80;return d<=20?{x:10+d,y:10}:d<=40?{x:30,y:d-10}:d<=60?{x:70-d,y:30}:{x:10,y:90-d};}
    for(const t of [0,.001,1.999999,2,2.000001,7.99999,8,8.00001,15.9,16])for(let rank=0;rank<4;rank++)close(sampleProject(p,t).positions['p'+rank],analytic(10*t+20*rank));
    group.cues=[{count:0,direction:-1}];endpoints();const backwards=validateProject(project);
    for(const t of [.001,2,8.001,16])for(let rank=0;rank<4;rank++)close(sampleProject(backwards,t).positions['p'+rank],analytic(-10*t+20*rank));
  });
  it('matches a non-square analytic loop through two laps with entry and exit connectors',()=>{
    const {project,group,route,endpoints}=setup('conveyor',4,true);route.start={x:30,y:10};route.segments=[{id:'e',kind:'line',to:{x:70,y:10}},{id:'s',kind:'line',to:{x:70,y:40}},{id:'w',kind:'line',to:{x:30,y:40}},{id:'n',kind:'line',to:{x:30,y:10}}];Object.assign(group,{phase:0,speed:20,interval:20,offsetDirection:1,entryCounts:1,exitCounts:1});endpoints();const p=validateProject(project);
    const point=(d:number)=>{d=((d%140)+140)%140;return d<=40?{x:30+d,y:10}:d<=70?{x:70,y:d-30}:d<=110?{x:140-d,y:40}:{x:30,y:150-d};};
    for(const t of [1,8,14.9,8.125])for(let i=0;i<4;i++)close(sampleProject(p,t).positions['p'+i],point(20*(t-1)+i*20));
  });
  it('performs delayed counter-march turns and explicit stops with continuous positions and separate facing',()=>{
    const {project,group,endpoints}=setup('countermarch');group.cues=[{count:0,direction:1},{count:6,direction:0},{count:8,direction:-1}];endpoints();const p=validateProject(project);
    for(const rank of [0,1,2]){const id='p'+rank,turn=8+rank;close(sampleProject(p,turn).positions[id],{x:42,y:10});close(sampleProject(p,turn-.00001).positions[id],sampleProject(p,turn+.00001).positions[id],.0001);}
    expect(p.moves[0].marchingDirections).toBeUndefined();
  });
  it('distinguishes follower time delay from conveyor distance offset across changes of speed direction',()=>{
    const {group}=setup();group.delay=2;group.cues=[{count:0,direction:1},{count:4,direction:-1}];group.interval=4;
    expect(memberDistance(group,1,5)).toBe(26);const conveyor={...group,mode:'conveyor' as const};expect(memberDistance(conveyor,1,5)).toBe(22);
  });
  it('requires reviewable entry and exit submoves instead of snapping incompatible endpoints',()=>{
    const {project,group}=setup();project.sets[0].positions.p0={x:1,y:1};project.sets[1].positions.p0={x:99,y:40};
    expect(()=>validateProject(project)).toThrow(/entry connector/);group.entryCounts=2;expect(()=>validateProject(project)).toThrow(/exit connector/);group.exitCounts=2;
    const p=validateProject(project);expect(p.sets).toEqual(project.sets);close(sampleProject(p,0).positions.p0,{x:1,y:1});close(sampleProject(p,16).positions.p0,{x:99,y:40});close(sampleProject(p,2).positions.p0,{x:30,y:10});close(sampleProject(p,14).positions.p0,{x:54,y:10});
  });
  it('rejects insufficient history by default, or explicitly holds at open endpoints with long delays',()=>{
    const {project,group,endpoints}=setup();group.delay=64;group.endpointPolicy='hold';endpoints();const p=validateProject(project);
    for(const t of [0,8,16]){close(sampleProject(p,t).positions.p1,{x:10,y:10});close(sampleProject(p,t).positions.p2,{x:10,y:10});}
    group.endpointPolicy='reject';expect(()=>validateProject(project)).toThrow(/insufficient/);
  });
  it('enforces capacity including last-to-first interval and permits corner/self-crossing geometry explicitly',()=>{
    const {project,group,endpoints}=setup('conveyor',4,true);group.interval=20;endpoints();expect(()=>validateProject(project)).not.toThrow();group.interval=20.001;expect(()=>validateProject(project)).toThrow(/last-to-first/);
    group.interval=1;project.sharedRoutes![0].segments[0].to={x:30,y:30};project.sharedRoutes![0].segments[1].to={x:30,y:10};endpoints();expect(()=>validateProject(project)).not.toThrow();
  });
  it('validates bounded metadata, membership, cues, phases, references and numerical timing without mutation',()=>{
    const {project,group}=setup(),before=structuredClone(project);
    for(const mutate of [g=>g.members=['p0','p0'],g=>g.members=['p0','missing'],g=>g.speed=NaN,g=>g.delay=-1,g=>g.phase=Infinity,g=>g.entryCounts=16,g=>g.cues=[],g=>g.cues=[{count:2,direction:1}],g=>g.cues=[{count:0,direction:1},{count:0,direction:-1}],g=>g.cues=[{count:16,direction:1}],g=>g.cues=[{count:-3,direction:1}],g=>g.mode='countermarch',g=>g.routeId='missing',g=>g.name=' '] as ((g:GroupMotion)=>void)[]){const bad=structuredClone(group);mutate(bad);expect(()=>validateGroupMotions([bad],project,0)).toThrow();}
    expect(()=>validateGroupMotions([group,{...group,id:'g2',name:'Second'}],project,0)).toThrow(/only one group/);expect(project).toEqual(before);
  });
  it('refuses unresolved/ludicrous loop work and zero-length geometry without partial acceptance',()=>{
    const {project,group}=setup('conveyor',2,true);group.speed=100;group.interval=1;group.entryCounts=1;group.exitCounts=1;
    expect(()=>validateProject(project)).toThrow(/16 route lengths/);
    project.sharedRoutes![0].segments[0].to={x:10,y:10};expect(()=>validateProject(project)).toThrow(/0.01 yard/);
  });
  it('rescales count delay, connectors, cue clocks and speed while retaining every normalized sample',()=>{
    const {project,group,endpoints}=setup('countermarch');group.entryCounts=1;group.exitCounts=2;group.cues=[{count:-2,direction:1},{count:4,direction:0},{count:6,direction:-1}];endpoints();const p=validateProject(project),resized=updateSetProperties(p,1,{counts:32});validateProjectEdit(p,resized);
    for(const t of [0,.25,1,4.4,8,15.9,16])expect(sampleProject(resized,t*2).positions).toEqual(sampleProject(p,t).positions);
    expect(resized.moves[0].groupMotions![0].speed).toBe(group.speed/2);expect(resized.moves[0].groupMotions![0].delay).toBe(2);
  });
  it('reverses complete conveyor/follow/counter-march groups with negative history exactly and refuses partial groups',()=>{
    for(const mode of ['conveyor','follow','countermarch'] as const){const {project,group,endpoints}=setup(mode,4,true);group.delay=2;group.interval=5;group.entryCounts=1;group.exitCounts=2;group.cues=[{count:-6,direction:1},{count:-2,direction:-1},{count:2,direction:0},{count:4,direction:1},{count:10,direction:-1}];if(mode==='conveyor')group.cues=group.cues.filter(c=>c.count>=0),group.cues.unshift({count:0,direction:1});endpoints();const p=validateProject(project),reversed=reversePaths(p,0,group.members);validateProjectEdit(p,reversed);
      for(const t of [0,.01,1,3.1,6,10.25,15.99,16])for(const id of group.members)close(sampleProject(reversed,t).positions[id],sampleProject(p,16-t).positions[id]);
      expect(()=>reversePaths(p,0,group.members.slice(1))).toThrow(/every member/);
    }
  });
  it('protects referenced route geometry/deletion, allows renaming, and blocks individual edits/copy and rewiring',()=>{
    const {project,group,route}=setup();const p=validateProject(project),base={routeId:route.id,existing:true,revision:0,epoch:0};
    expect(()=>editSharedRoute(p,{...base,route:null})).toThrow(/used by group/);expect(()=>editSharedRoute(p,{...base,route:{...route,start:{x:5,y:5}}})).toThrow(/used by group/);expect(editSharedRoute(p,{...base,route:{...route,name:'Renamed'}}).sharedRoutes![0].name).toBe('Renamed');
    expect(()=>editMovementSchedule(p,{moveId:p.moves[0].id,performerId:'p0',path:null,revision:0,epoch:0})).toThrow(/group movement/);expect(()=>copyIntervals(p,0,'p0',['implicit-line'],true,'clip',0)).toThrow(/group movement/);expect(()=>createPicture(p,1,'insert-before',16)).toThrow(/starting set/);
    const store=createEditorStore(p);store.dispatch('set.select',{index:1});store.setValue('selection','selectedIds',[group.members[0]]);expect(store.dispatch('path.open')).toBe(false);expect(store.dispatch('performers.remove',{ids:['p0']})).toBe(false);expect(store.getState().project.present).toEqual(p);
  });
  it('supports 2/64/500 identities without mutating base paths and retains compact serialized definitions',()=>{
    for(const count of [2,64,500])for(const closed of [false,true]){const {project,group,endpoints}=setup('conveyor',count,closed);group.interval=.01;endpoints();const p=validateProject(project),content=serializeProject(p),loaded=parseProject(content);expect(loaded).toEqual(p);expect(effectiveMove(p,0).paths).toHaveProperty('p'+(count-1));expect(content).not.toContain('linearCounts');expect(content.length).toBeLessThan(200000);expect(sampleProject(loaded,7.25)).toEqual(sampleProject(p,7.25));}
  });
  it('reports conservative crossing/stride consequences from the exact grouped paths',async()=>{
    const {project,group,endpoints}=setup('countermarch',2);group.cues=[{count:0,direction:1},{count:8,direction:-1}];endpoints();const p=validateProject(project),input=transitionInput(p,1,0)!;
    const result=await new TransitionAnalyzer().analyze(input);expect(result!.issues.some(i=>i.type==='stride')).toBe(true);expect(result!.issues.some(i=>i.type==='collision')).toBe(true);
    for(const issue of result!.issues)expect(issue.measurement?.converged).toBe(true);
  });
  it('bounds generated work per member and across a valid-looking compact project',()=>{
    const first=setup('conveyor',2,true);first.route.start={x:10,y:10};first.route.segments=[{id:'loop',kind:'cubic',to:{x:10,y:10},control1:{x:100,y:50},control2:{x:0,y:50}}];first.group.interval=.01;first.group.speed=compileRoute(first.route).length*12/16;first.endpoints();const before=structuredClone(first.project);expect(()=>validateProject(first.project)).toThrow(/4,096|budget/);expect(first.project).toEqual(before);
    const {project,group,endpoints}=setup('conveyor',500,true);group.interval=.01;group.speed=75;endpoints();const start=project.sets[0];project.sets=Array.from({length:8},(_,i)=>({...structuredClone(start),id:'set-'+i}));const move=project.moves[0];project.moves=Array.from({length:7},(_,i)=>({...structuredClone(move),id:'move-'+i,fromSetId:'set-'+i,toSetId:'set-'+(i+1)}));const snapshot=structuredClone(project);expect(()=>validateProject(project)).toThrow(/budget|200,000/);expect(project).toEqual(snapshot);
  },20000);
  it('keeps fractional connector boundaries exact and rejects hold-only near-matching endpoint dots',()=>{
    for(const entryCounts of [.1,.2,.3,.7,1.1])for(const exitCounts of [.1,.4,.6,.9]){const {project,group}=setup('conveyor',2);Object.assign(group,{entryCounts,exitCounts});const p=validateProject(project),path=effectiveMove(p,0).paths.p0;expect(path.segments[0].endCount).toBe(entryCounts);expect(path.segments.at(-2)!.endCount).toBe(16-exitCounts);expect(path.segments.at(-1)!.startCount).toBe(16-exitCounts);for(let i=1;i<path.segments.length;i++)expect(path.segments[i].startCount).toBe(path.segments[i-1].endCount);expect(sampleProject(p,16).positions.p0).toEqual(p.sets[1].positions.p0);}
    const {project,group,endpoints}=setup('follow',2);group.cues=[{count:0,direction:0}];endpoints();project.sets[1].positions.p0.x+=5e-9;expect(()=>validateProject(project)).toThrow(/hold-only.*identical/);group.exitCounts=1;const p=validateProject(project);expect(sampleProject(p,16).positions.p0).toEqual(p.sets[1].positions.p0);
  });
  it('requires v12 on disk, rejects runtime derived paths and continues rejecting unsupported future versions',()=>{
    const {project}=setup(),raw=JSON.parse(serializeProject(project));raw.schemaVersion=11;expect(()=>parseProject(JSON.stringify(raw))).toThrow(/requires schema version 12/);raw.schemaVersion=13;expect(()=>parseProject(JSON.stringify(raw))).toThrow(/Update Squidware/);
    const p=structuredClone(project);p.moves[0].paths.p0=groupMemberPath(project,0,project.moves[0].groupMotions![0],0);expect(()=>validateProject(p)).toThrow(/derived group paths/);
  });
  it('keeps negative-clock integration reproducible over cue boundaries',()=>{
    const {group}=setup();group.cues=[{count:-2,direction:1},{count:1,direction:0},{count:3,direction:-1}];expect(leaderDistance(group,-4)).toBe(12);expect(leaderDistance(group,1)).toBe(22);expect(leaderDistance(group,3)).toBe(22);expect(leaderDistance(group,4)).toBe(20);expect(reverseGroupMotion({...group,entryCounts:1,exitCounts:1},16).members).toEqual(['p2','p1','p0']);
  });
});
