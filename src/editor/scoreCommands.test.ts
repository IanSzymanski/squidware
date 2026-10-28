import { expect, it } from 'vitest';
import v1 from '../fixtures/schema-v1.squid?raw';
import { parseProject, serializeProject } from '../domain';
import { compileScore, defaultScore } from '../score';
import { parseMeterText } from '../meter';
import { createEditorStore } from './store';
import { reviewSheetRange } from './productionSheet';
const fixture=()=>parseProject(v1);
it('applies musical sheet cells atomically and navigates with the same count conversion',()=>{
 const p=fixture(),store=createEditorStore(p),s=store.getState();
 expect(store.dispatch('sheet.apply',{row:0,column:4,cells:[['4/4','Intro'],['6/8:3+3','A'],['3/4','B']],revision:s.project.revision,epoch:s.ui.projectEpoch})).toBe(true);
 const next=store.getState().project.present;
 expect(next.score?.changes.map(c=>c.count)).toEqual([16,40]);expect(next.sets).toEqual(p.sets);expect(next.moves).toEqual(p.moves);
 expect(store.getState().project.past).toHaveLength(1);expect(parseProject(serializeProject(next))).toEqual(next);
 expect(store.dispatch('score.seek',{measure:6,beat:2.5})).toBe(true);expect(store.getState().playback).toMatchObject({count:23.5,playing:false});
 store.dispatch('history.undo');expect(store.getState().project.present).toEqual(p);store.dispatch('history.redo');expect(store.getState().project.present).toEqual(next);
});
it('validates musical paste errors before committing and cannot shorten past a score anchor',()=>{
 const store=createEditorStore(fixture()),s=store.getState();
 expect(store.dispatch('score.save',{meter:parseMeterText('4/4'),score:{...defaultScore(),changes:[{count:16,meter:parseMeterText('3/4')}],marks:[{count:40,label:'End'}]},revision:s.project.revision,epoch:s.ui.projectEpoch})).toBe(true);
 const before=store.getState().project;
 expect(reviewSheetRange(before.present,{row:1,column:4,cells:[['5/4:2+2','Bad']]}).errors.join(' ')).toMatch(/meter/);
 expect(reviewSheetRange(before.present,{row:2,column:5,cells:[['End']]}).errors).toEqual([]);
 expect(store.dispatch('set.update',{index:2,update:{counts:8}})).toBe(false);expect(store.getState().project).toBe(before);
 expect(store.dispatch('sheet.apply',{row:1,column:1,cells:[['3']],revision:before.revision,epoch:store.getState().ui.projectEpoch})).toBe(false);
 expect(store.getState().project).toBe(before);
});
it('rejects stale map drafts, invalid musical seeks and conflicting opening meter changes',()=>{
 const store=createEditorStore(fixture()),s=store.getState(),args={meter:parseMeterText('4/4'),score:{...defaultScore(),pickupCounts:2,changes:[{count:10,meter:parseMeterText('6/8')}]},revision:s.project.revision,epoch:s.ui.projectEpoch};
 store.dispatch('score.open');expect(store.dispatch('score.save',args)).toBe(true);
 const before=store.getState().project;
 expect(store.dispatch('score.save',args)).toBe(false);
 expect(store.dispatch('score.seek',{measure:0,beat:1})).toBe(false);expect(store.dispatch('score.seek',{measure:0,beat:3})).toBe(true);
 expect(store.dispatch('metronome.configure',{meter:parseMeterText('3/4'),enabled:true,countInBars:1,speed:1})).toBe(false);
 expect(store.getState().project).toBe(before);expect(compileScore(before.present).spans).toHaveLength(2);
});
