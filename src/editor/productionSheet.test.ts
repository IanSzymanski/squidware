import { describe, expect, it } from 'vitest';
import v1 from '../fixtures/schema-v1.squid?raw';
import { parseProject, serializeProject, setStartCount, totalCounts, PROJECT_LIMITS } from '../domain';
import { createPerformanceFixture } from '../performanceFixtures';
import { createEditorStore } from './store';
import { applySheetRange, parseSheetText, reviewSheetRange, type SheetEdit } from './productionSheet';

const fixture = () => parseProject(v1);
const edit = (store: ReturnType<typeof createEditorStore>, cells: string[][], row = 0, column = 0): SheetEdit => ({ row, column, cells, revision: store.getState().project.revision, epoch: store.getState().ui.projectEpoch });

describe('production sheet input', () => {
  it('parses quoted TSV and CSV with BOM, escaped quotes, multiline notes, CRLF and trailing empty cells', () => {
    expect(parseSheetText('\uFEFFOpening\t0\t91.25\t"Line 1\nLine 2, ""quoted"""\r\n')).toEqual([['Opening','0','91.25','Line 1\nLine 2, "quoted"']]);
    expect(parseSheetText('"Name, one",16,120,"a\tb"\r\nNext,32,130,\r\n')).toEqual([['Name, one','16','120','a\tb'],['Next','32','130','']]);
    expect(parseSheetText('1\t2\n\t\n')).toEqual([['1','2'],['','']]);
  });
  it('rejects malformed, oversized and excess ranges without silently dropping cells', () => {
    for (const text of ['', '"unclosed', 'a"b,c', '"a"tail,c', 'a,b,c,d,e,f,g', 'a\n'.repeat(129), 'x'.repeat(PROJECT_LIMITS.projectBytes+1)]) expect(() => parseSheetText(text)).toThrow();
    const p = fixture();
    for (const range of [
      { row: -1, column: 0, cells: [['A']] }, { row: 4, column: 0, cells: [['A']] },
      { row: 0, column: 3, cells: [['A','B']] }, { row: 0, column: 0, cells: [['A','0'], ['B']] },
      { row: 0, column: 0, cells: Array.from({length:128},(_,i)=>['X',String(i===0?0:32),'120','']).concat([['129']]) },
    ]) { expect(reviewSheetRange(p,range).errors.length).toBeGreaterThan(0); expect(() => applySheetRange(p,range,32)).toThrow(); }
  });
  it('reports every invalid cell with its sheet row and column', () => {
    const review = reviewSheetRange(fixture(), { row: 0, column: 0, cells: [['','1','NaN','\u0000'],['Fine','0','401','fine']] });
    expect(review.errors).toHaveLength(6);
    expect(review.errors.join(' ')).toMatch(/Row 1 · Name.*Row 1 · Counts.*Row 1 · BPM.*Row 1 · Notes.*Row 2 · Counts.*Row 2 · BPM/);
    for (const value of ['', '1.5', '0', '1025', 'Infinity', '0x10', '1e2']) expect(reviewSheetRange(fixture(), {row:1,column:1,cells:[[value]]}).errors.length).toBeGreaterThan(0);
    expect(reviewSheetRange(fixture(), {row:0,column:1,cells:[['0','20'],['1024','400']]}).errors).toEqual([]);
  });
});

describe('atomic sheet command', () => {
  it('updates all rows and timing once, preserving geometry, explicit paths, transitions and selection', () => {
    const p = fixture(); p.moves[0].paths.a = { segments: [{id:'path',kind:'line',startCount:0,endCount:16}] };
    const store = createEditorStore(p);
    store.dispatch('set.select',{index:2}); store.setValue('selection','selectedIds',['a']); store.setValue('playback','playing',true);
    const range = edit(store,[['Start','0','100',''],['Travel','12','143.25','Slow'],['Finish','30','150','Arrive']]);
    expect(store.dispatch('sheet.apply',range)).toBe(true);
    const s = store.getState(), next = s.project.present;
    expect(totalCounts(next)).toBe(42); expect(s.playback).toMatchObject({count:42,playing:false});
    expect(s.selection).toEqual({activeIndex:2,selectedIds:['a']});
    expect(next.sets.map(s=>s.positions)).toEqual(p.sets.map(s=>s.positions));
    expect(next.moves[0]).toMatchObject({id:p.moves[0].id,transition:'ease',paths:{a:{segments:[{id:'path',startCount:0,endCount:12,kind:'line'}]}}});
    expect(s.project.past).toHaveLength(1); expect(s.project.past[0].name).toMatch(/sheet · 3 rows/);
    expect(parseProject(serializeProject(next))).toEqual(next);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
    store.dispatch('history.redo'); expect(store.getState().project.present).toEqual(next);
  });
  it('can block out a 128-set production in one paste with new hold rows and one undo', () => {
    const p = fixture(); p.sets = p.sets.slice(0,1); p.moves = [];
    const store = createEditorStore(p);
    const cells = Array.from({length:128},(_,i)=>[`Set ${i+1}`,String(i===0?0:i%1024+1),'132.5',`Notes ${i}`]);
    expect(store.dispatch('sheet.apply',edit(store,cells))).toBe(true);
    const s = store.getState(), next = s.project.present;
    expect(next.sets).toHaveLength(128); expect(next.moves).toHaveLength(127);
    expect(next.sets.every(s=>JSON.stringify(s.positions)===JSON.stringify(p.sets[0].positions))).toBe(true);
    expect(new Set(next.sets.map(s=>s.id)).size).toBe(128);
    expect(s.project.past).toHaveLength(1);
    expect(parseProject(serializeProject(next))).toEqual(next);
    expect(store.dispatch('sheet.append')).toBe(false);
    const before = store.getState().project;
    expect(store.dispatch('sheet.apply',edit(store,[['129']],128))).toBe(false);
    expect(store.getState().project).toBe(before);
    store.dispatch('history.undo'); expect(store.getState().project.present).toEqual(p);
  });
  it('rejects invalid and stale batches without partial data, history, selection or playback changes', () => {
    const store = createEditorStore(fixture());
    const invalid = edit(store,[['Good','0','120',''],['Bad','1025','130','']]);
    const before = store.getState();
    expect(store.dispatch('sheet.apply',invalid)).toBe(false);
    expect(store.getState().project).toBe(before.project); expect(store.getState().playback).toBe(before.playback);
    const stale = edit(store,[['old']]); store.dispatch('set.update',{index:1,update:{name:'Other change'}});
    expect(store.dispatch('sheet.apply',stale)).toBe(false);
    const replaced = edit(store,[['old']]); store.dispatch('project.load',{project:fixture()});
    expect(store.dispatch('sheet.apply',replaced)).toBe(false);
    const current = edit(store,[['new']]); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('sheet.apply',current)).toBe(false);
  });
  it('partial ranges preserve untouched cells at maximum project size', () => {
    const p = createPerformanceFixture('maximum'), store = createEditorStore(p);
    store.dispatch('set.select',{index:127});
    expect(store.dispatch('sheet.apply',edit(store,[['24','99.5','']],127,1))).toBe(true);
    const next = store.getState().project.present;
    expect(next.sets[127]).toEqual({...p.sets[127],notes:''});
    expect(next.sets.slice(0,127)).toEqual(p.sets.slice(0,127));
    expect(store.getState().playback.count).toBe(setStartCount(next,127));
    expect(next.moves[126]).toEqual({...p.moves[126],counts:24,tempo:99.5});
  });
  it('new rows inherit the preceding edited tempo and personal default counts for omitted columns', () => {
    const p = fixture();
    const next = applySheetRange(p, { row: 2, column: 2, cells: [['180'], ['190'], ['200']] }, 24);
    expect(next.moves.slice(1).map(m => [m.counts, m.tempo])).toEqual([[24,180],[24,190],[24,200]]);
    expect(next.sets[4].positions).toEqual(p.sets[2].positions);
    const notes = applySheetRange(next, { row: 4, column: 3, cells: [['New notes'],['Next notes']] }, 16);
    expect(notes.moves.at(-1)).toMatchObject({counts:16,tempo:200});
  });
});

it('accepts the full score editor event range while preserving the sheet row limit',()=>{
 const text=Array.from({length:512},(_,i)=>`${i},,Mark${i}`).join('\n');
 expect(()=>parseSheetText(text)).toThrow(/128/);
 expect(parseSheetText(text,{maxRows:512,maxColumns:3})).toHaveLength(512);
 expect(()=>parseSheetText(text+'\n513,,Extra',{maxRows:512,maxColumns:3})).toThrow(/512/);
});
