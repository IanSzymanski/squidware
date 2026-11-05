import { describe, expect, it } from 'vitest';
import { createDemoProject, parseProject, serializeProject } from '../domain';
import type { FormationKind, Point } from '../types';
import { createEditorStore } from './store';
import { currentFormationResult } from './formationSession';
import { canEditPositions } from './editMode';
import { hasUnsavedWork, markFileOpened } from './fileSession';

function setup() {
  const project = createDemoProject(); const ids = project.performers.slice(0,3).map(p=>p.id);
  ids.forEach((id,i)=>{project.sets[0].positions[id]={x:40+i*5,y:25};});
  const store = createEditorStore(project); markFileOpened(store,false);
  store.setValue('selection','selectedIds',ids);
  return {store,project:store.getState().project.present,ids};
}
describe('formation preview commands', () => {
  it.each<FormationKind>(['line','arc','circle','block','curve'])('%s previews remain unsaved and apply exactly once with undo/redo and file round trip', kind => {
    const {store,project,ids}=setup(); const before=serializeProject(project);
    expect(store.dispatch('formation.preview',{kind})).toBe(true);
    const session=store.getState().ui.formationPreview!;
    for (const width of [12,16,20]) store.dispatch('formation.update',{options:{...session.options,width,height:10}});
    const expected=currentFormationResult(store.getState())!.updates;
    expect(canEditPositions(store.getState())).toBe(false);
    expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    expect(store.getState().project.past).toHaveLength(0);
    expect(store.dispatch('positions.move',{index:0,updates:{[ids[0]]:{x:1,y:1}}})).toBe(false);
    expect(store.dispatch('transform.preview',{})).toBe(false);
    expect(store.dispatch('formation.apply')).toBe(true);
    expect(store.getState().project.past).toHaveLength(1); expect(store.getState().project.past[0].name).toContain(`Apply ${kind} to 3 performers`);
    for (const id of ids) expect(store.getState().project.present.sets[0].positions[id]).toEqual(expected[id]);
    expect(store.getState().project.present.sets[1]).toBe(project.sets[1]); expect(store.getState().project.present.performers).toBe(project.performers);
    expect(store.getState().project.present.sets[0].positions[project.performers[4].id]).toBe(project.sets[0].positions[project.performers[4].id]);
    expect(parseProject(serializeProject(store.getState().project.present))).toEqual(store.getState().project.present);
    store.dispatch('history.undo'); expect(serializeProject(store.getState().project.present)).toBe(before); expect(hasUnsavedWork(store.getState())).toBe(false);
    store.dispatch('history.redo'); for (const id of ids) expect(store.getState().project.present.sets[0].positions[id]).toEqual(expected[id]);
  });
  it('retains independent shape parameters, cancels without history and rejects invalid, pending and unchanged previews', () => {
    const {store}=setup(); const history=store.getState().project;
    store.dispatch('formation.preview',{kind:'line'}); const line=store.getState().ui.formationPreview!.options;
    store.dispatch('formation.update',{options:{...line,width:12,rotation:15}});
    store.dispatch('formation.preview',{kind:'block'}); const block=store.getState().ui.formationPreview!.options;
    store.dispatch('formation.update',{options:{...block,width:30,columns:3}});
    store.dispatch('formation.preview',{kind:'line'}); expect(store.getState().ui.formationPreview!.options).toMatchObject({width:12,rotation:15});
    store.dispatch('formation.preview',{kind:'block'}); expect(store.getState().ui.formationPreview!.options).toMatchObject({width:30,columns:3});
    store.dispatch('formation.update',{options:{...block,width:200}}); expect(store.dispatch('formation.apply')).toBe(false);
    store.dispatch('formation.update',{options:{...block,width:20}}); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('formation.apply')).toBe(false); expect(store.dispatch('formation.preview',{kind:'line'})).toBe(false);
    expect(store.dispatch('formation.cancel')).toBe(true); expect(store.getState().project).toBe(history);
    expect(store.getState().ui.pendingDraft).toBe(true); // Never clears another field's draft.
    store.setValue('ui','pendingDraft',false);
    store.dispatch('formation.preview',{kind:'line'});
    store.dispatch('formation.update',{options:{...line,width:10,height:0}});
    expect(store.dispatch('formation.apply')).toBe(false); // Original 40,45,50 line.
    store.dispatch('formation.cancel'); expect(store.getState().project).toBe(history);
  });
  it('invalidates stale sessions synchronously on context changes and protects unrelated pending fields', () => {
    const changes: ((s:ReturnType<typeof setup>['store'])=>unknown)[] = [s=>s.dispatch('selection.clear'),s=>s.dispatch('set.select',{index:1}),s=>s.dispatch('playback.toggle'),s=>s.dispatch('playback.scrub',{count:1}),s=>s.setValue('ui','view','3d'),s=>s.setValue('ui','workspace','cast'),s=>s.dispatch('dialog.open',{dialog:'help'}),s=>s.dispatch('set.update',{index:0,update:{notes:'changed'}}),s=>s.beginTransaction('Other edit')];
    for (const change of changes) {
      const {store}=setup(); store.dispatch('formation.preview',{}); change(store);
      expect(store.getState().ui.formationPreview).toBeNull(); expect(store.dispatch('formation.apply')).toBe(false);
    }
    const {store}=setup(); store.setValue('ui','pendingDraft',true);
    expect(store.dispatch('formation.preview',{})).toBe(false); expect(store.getState().ui.pendingDraft).toBe(true);
  });
  it.each<FormationKind>(['arc','line','circle','block','curve'])('Shape opens the demo brass as a %s inside the field with uncrossed shortest-travel paths', kind => {
    const project=createDemoProject(), store=createEditorStore(project), brass=project.performers.filter(p=>p.sectionId===project.sections[0].id).map(p=>p.id);
    expect(project.sections[0].name).toBe('Brass'); expect(brass).toHaveLength(24);
    store.setValue('selection','selectedIds',brass); if (kind!=='arc') store.setValue('ui','formation',kind);
    expect(store.dispatch('formation.preview',{})).toBe(true);
    const session=store.getState().ui.formationPreview!, result=currentFormationResult(store.getState())!;
    expect(session).toMatchObject({kind,assignmentMode:'shortest',options:{assignment:'position'}});
    if (kind==='arc') expect(session.options).toMatchObject({width:56,height:14});
    expect(result.error).toBeNull(); expect(properCrossings(project.sets[0].positions,result.updates)).toBe(0);
    // The brass already stand in an 8 × 3 block, so the selection-sized block seed reproduces it exactly.
    expect(result.changed).toBe(kind!=='block'); if (kind==='block') return;
    expect(store.dispatch('formation.apply')).toBe(true);
    expect(store.getState().project.past[0].name).toContain(`Apply ${kind} to 24 performers (shortest-travel assignment)`);
  });
  it('opens new shapes inside the field for a selection against the back sideline, while session drafts keep precedence', () => {
    const {store,ids}=setup(); const edge:Record<string,Point>={[ids[0]]:{x:40,y:1},[ids[1]]:{x:45,y:3},[ids[2]]:{x:50,y:5}};
    store.dispatch('positions.move',{index:0,updates:edge}); store.setValue('selection','selectedIds',ids);
    for (const kind of ['line','arc','circle','block','curve'] as FormationKind[]) {
      store.dispatch('formation.preview',{kind}); expect(currentFormationResult(store.getState())!.error).toBeNull();
    }
    store.dispatch('formation.cancel'); store.dispatch('formation.preview',{kind:'arc'});
    store.dispatch('formation.update',{options:{...store.getState().ui.formationPreview!.options,width:45,height:22}});
    expect(currentFormationResult(store.getState())!.error).toMatch(/field boundary/);
    store.dispatch('formation.cancel'); store.dispatch('formation.preview',{kind:'arc'});
    expect(store.getState().ui.formationPreview!.options).toMatchObject({width:45,height:22}); // Drafts are never silently refit.
  });
});

function properCrossings(from: Record<string, Point>, to: Record<string, Point>): number {
  const side = (a: Point, b: Point, c: Point) => { const v = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); return Math.abs(v) < 1e-9 ? 0 : Math.sign(v); };
  const names = Object.keys(to); let count = 0;
  names.forEach((a, i) => names.slice(i+1).forEach(b => {
    const [p, q, r, t] = [from[a], to[a], from[b], to[b]];
    const s1 = side(p,q,r), s2 = side(p,q,t), s3 = side(r,t,p), s4 = side(r,t,q);
    if (s1 && s2 && s3 && s4 && s1 !== s2 && s3 !== s4) count++;
  }));
  return count;
}
