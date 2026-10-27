import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShowAnalysis, defaultProblemFilter, findings, problemMarkers } from './show';
import { createEditorStore } from '../editor/store';
import { createBlankProject, analyzeTransition, setStartCount } from '../domain';
import type { AnalysisWorker } from './client';
import type { AnalysisRequest, AnalysisResponse } from './input';
import { TransitionAnalyzer } from './engine';
import { createPerformanceFixture } from '../performanceFixtures';
class Worker implements AnalysisWorker {
  onmessage: AnalysisWorker['onmessage'] = null;
  onerror: AnalysisWorker['onerror'] = null;
  onmessageerror: AnalysisWorker['onmessageerror'] = null;
  messages: AnalysisRequest[] = [];
  terminate = vi.fn();
  postMessage(message: AnalysisRequest) { this.messages.push(message); }
  reply(data: AnalysisResponse) { this.onmessage?.({ data } as MessageEvent<AnalysisResponse>); }
}
function fixture() {
  const p=createBlankProject();
  p.performers=Array.from({length:16},(_,i)=>({id:`p${i}`,label:`P${i}`,name:'',sectionId:p.sections[0].id}));
  p.sets=Array.from({length:4},(_,i)=>({id:`s${i}`,name:`Picture ${i}`,notes:'',positions:Object.fromEntries(p.performers.map((person,j)=>[person.id,{x:10+i*12,y:10+j*.2}]))}));
  p.moves=Array.from({length:3},(_,i)=>({id:`m${i}`,fromSetId:`s${i}`,toSetId:`s${i+1}`,counts:8,tempo:120+i*20,transition:i===1?'ease' as const:'linear' as const,paths:{}}));
  return p;
}
function setup(p=fixture()) {
  vi.useFakeTimers();
  const store=createEditorStore(p), workers:Worker[]=[], engine=new TransitionAnalyzer();
  const service=new ShowAnalysis(store,()=>{const w=new Worker();workers.push(w);return w;});service.start();
  async function drain() {
    for(let i=0;i<150 && service.getSnapshot().moves.some(m=>m.status==='pending');i++) {
      await vi.advanceTimersByTimeAsync(0);
      const worker=[...workers].reverse().find(w=>!w.terminate.mock.calls.length)!, message=worker.messages.at(-1)!;
      const result=message.input && await engine.analyze(message.input,()=>false,async()=>{});
      if(result)worker.reply({revision:message.revision,result});
    }
    expect(service.getSnapshot().moves.every(m=>m.status==='ready')).toBe(true);
  }
  return {store,service,workers,drain};
}
afterEach(()=>vi.useRealTimers());
describe('show-wide result ownership',()=>{
  it('matches the reference across moves, exposes every finding, sorts/filters and bounds only marker rendering',async()=>{
    const {store,service,drain}=setup();await drain();
    const checks=service.getSnapshot();
    for(const move of checks.moves)expect(move.issues).toEqual(analyzeTransition(checks.project,move.index));
    const rows=findings(checks,defaultProblemFilter);expect(rows.length).toBeGreaterThan(120);
    expect(rows.every((row,i)=>i===0 || rows[i-1].issue.atCount!<=row.issue.atCount!)).toBe(true);
    const filtered=findings(checks,{...defaultProblemFilter,type:'stride',moveId:'m1',query:'p15',sort:'severity'});
    expect(filtered).toHaveLength(1);expect(filtered[0].issue.performerIds).toEqual(['p15']);
    const markers=problemMarkers(checks.moves,0,24,140);
    expect(markers.length).toBeLessThanOrEqual(11);expect(markers.reduce((n,m)=>n+m.count,0)).toBe(rows.length);
    const before=store.getState().project;
    const row=rows.find(r=>r.index===2)!;
    expect(store.dispatch('analysis.problem-review',{epoch:checks.epoch,moveId:row.moveId,atCount:row.issue.atCount!,ids:row.issue.performerIds})).toBe(true);
    expect(store.getState().playback.count).toBe(row.issue.atCount);expect(store.getState().selection.activeIndex).toBe(2);
    expect(store.getState().selection.selectedIds).toEqual(row.issue.performerIds);expect(store.getState().project).toBe(before);
    service.dispose();
  });
  it('invalidates both neighboring moves before rendering, preserves unaffected results and rejects old replies, undo and same-ID loads',async()=>{
    const {store,service,workers,drain}=setup();await drain();
    const old=service.getSnapshot(), worker=workers[0], message=worker.messages.at(-1)!;
    store.dispatch('set.select',{index:1});store.dispatch('positions.move',{index:1,updates:{p0:{x:20,y:30}}});
    expect(service.getSnapshot().moves.map(m=>m.status)).toEqual(['pending','pending','ready']);
    expect(service.getSnapshot().moves[2]).toBe(old.moves[2]);
    worker.reply({revision:message.revision,result:{issues:old.moves[2].issues,stats:{mode:'cached',changedPerformers:0,possiblePairs:0,exactPairs:0,elapsedMs:0}}});
    expect(service.getSnapshot().moves[0].issues).toHaveLength(0);await drain();
    store.dispatch('history.undo');await drain();expect(service.getSnapshot().moves[0].issues).toEqual(old.moves[0].issues);
    store.dispatch('project.load',{project:old.project});expect(service.getSnapshot().moves.every(m=>m.status==='pending')).toBe(true);await drain();
    expect(store.dispatch('analysis.problem-review',{epoch:old.epoch,moveId:'m0',atCount:1,ids:['p0']})).toBe(false);
    service.dispose();
  });
  it('keeps throttled drag results separate, hides every superseded preview and discards cancellation and committed edits',async()=>{
    const {store,service,workers,drain}=setup();await drain();const committed=service.getSnapshot().moves;
    for(let i=0;i<30;i++)service.draft(1,{p0:{x:20+i/10,y:20}});
    expect(service.getSnapshot().draft?.state.status).toBe('pending');await vi.advanceTimersByTimeAsync(121);
    const worker=workers[1], message=worker.messages.at(-1)!;
    expect(worker.messages.filter(m=>m.input)).toHaveLength(1);
    expect(message.input?.tracks[0].to.x).toBe(22.9);expect(service.getSnapshot().moves).toBe(committed);
    const result=(await new TransitionAnalyzer().analyze(message.input!,()=>false,async()=>{}))!;
    worker.reply({revision:message.revision,result});
    await vi.advanceTimersByTimeAsync(1);
    const outgoing=worker.messages.at(-1)!;expect(outgoing.input?.moveId).toBe('m1');
    worker.reply({revision:outgoing.revision,result:(await new TransitionAnalyzer().analyze(outgoing.input!,()=>false,async()=>{}))!});
    expect(service.getSnapshot().draft?.state.status).toBe('ready');
    expect(service.getSnapshot().draft?.results).toHaveLength(2);
    service.draft(1,{p0:{x:25,y:20}});expect(service.getSnapshot().draft?.state.result).toBeUndefined();
    worker.reply({revision:message.revision,result});expect(service.getSnapshot().draft?.state.status).toBe('pending');
    service.draft(1,null);worker.reply({revision:message.revision,result});expect(service.getSnapshot().draft).toBeNull();
    service.draft(0,{p0:{x:25,y:20}});await vi.advanceTimersByTimeAsync(121);expect(worker.messages.at(-1)?.input?.tracks[0].from.x).toBe(25);
    store.dispatch('set.select',{index:1});store.dispatch('positions.move',{index:1,updates:{p0:{x:30,y:20}}});expect(service.getSnapshot().draft).toBeNull();
    service.dispose();
  });
  it('reports unavailable moves and retries, survives effect restart, and checks all 127 maximum-roster moves',async()=>{
    const {service,workers,drain}=setup(createPerformanceFixture('maximum'));
    await vi.advanceTimersByTimeAsync(0);workers[0].onerror?.({} as ErrorEvent);
    expect(service.getSnapshot().moves[0].status).toBe('error');service.retry();
    service.dispose();service.start();await drain();
    expect(service.getSnapshot().moves).toHaveLength(127);
    for(const index of [1,64,127])expect(service.getSnapshot().moves[index-1].issues).toEqual(analyzeTransition(service.getSnapshot().project,index));
    service.dispose();
  },15000);
  it('rebases later counts after timing edits and guards invalid navigation or active drafts',async()=>{
    const {store,service,drain}=setup();await drain();
    store.dispatch('set.update',{index:1,update:{counts:16}});expect(service.getSnapshot().moves.map(m=>m.status)).toEqual(['pending','pending','pending']);await drain();
    const p=store.getState().project.present;expect(setStartCount(p,1)).toBe(16);
    expect(service.getSnapshot().moves[1].issues).toEqual(analyzeTransition(p,2));
    store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('analysis.problem-review',{epoch:0,moveId:'m0',atCount:2,ids:['p0']})).toBe(false);
    store.setValue('ui','pendingDraft',false);
    for(const atCount of [-1,17,Infinity])expect(store.dispatch('analysis.problem-review',{epoch:0,moveId:'m0',atCount,ids:['p0']})).toBe(false);
    service.dispose();
  });
});
