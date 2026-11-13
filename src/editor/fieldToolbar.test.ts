import { describe, expect, it } from 'vitest';
import { createDemoProject } from '../domain';
import { createEditorStore } from './store';
import { commandRegistry, type CommandDefinition, type CommandId } from './commands';
import { fieldToolbar } from './fieldToolbarModel';
import { paletteEntries } from './paletteCommands';

function setup() {
  const store=createEditorStore(createDemoProject());store.dispatch('set.select',{index:1});return store;
}
const all = (model:ReturnType<typeof fieldToolbar>) => [...model.primary,...model.secondary];
describe('contextual field command model',()=>{
  it('adapts selection, individual travel, groups, previews, playback and 3D without editing the show',()=>{
    const store=setup(),project=store.getState().project.present;
    expect(fieldToolbar(store.getState()).context).toBe('selection');
    const ids=project.performers.slice(0,3).map(p=>p.id);
    store.setValue('selection','selectedIds',ids.slice(0,1));
    expect(fieldToolbar(store.getState()).primary.map(a=>a.invocation.id)).toEqual(['coordinates.preview','path.open','path.draw-open','schedule.open']);
    store.setValue('selection','selectedIds',ids);
    expect(fieldToolbar(store.getState()).context).toBe('group');
    expect(store.dispatch('transform.preview',{})).toBe(true);
    expect(fieldToolbar(store.getState()).primary.map(a=>a.invocation.id)).toEqual(['transform.apply','transform.cancel']);
    store.dispatch('transform.cancel');store.dispatch('playback.toggle');
    expect(fieldToolbar(store.getState()).context).toBe('playback');
    expect(fieldToolbar(store.getState()).primary[0].invocation.id).toBe('playback.toggle');
    store.dispatch('playback.toggle');store.dispatch('view.select',{view:'3d'});
    expect(all(fieldToolbar(store.getState())).map(a=>a.invocation.id)).toEqual(['view.camera','view.camera','view.camera']);
    expect(store.getState().project.present).toBe(project);expect(store.getState().project.past).toEqual([]);
  });
  it('gives every removed Inspector launcher a home and takes availability from the registry',()=>{
    const store=setup(),homes=new Set<CommandId>();
    for(const n of [0,1,3]){
      store.setValue('selection','selectedIds',store.getState().project.present.performers.slice(0,n).map(p=>p.id));
      for(const pending of [false,true]){
        store.setValue('ui','pendingDraft',pending);
        for(const action of all(fieldToolbar(store.getState()))){
          homes.add(action.invocation.id);
          const definition=commandRegistry[action.invocation.id] as unknown as CommandDefinition<CommandId>;
          expect(action.disabledReason===null).toBe(definition.enabled(store.getState(),action.invocation.args));
          if(action.disabledReason)expect(action.disabledReason.length).toBeGreaterThan(10);
        }
      }
    }
    for(const id of ['transform.preview','formation.preview','spacing.preview','coordinates.preview','routes.open','path.open','path.draw-open','schedule.open','path.operations-open','templates.open','group.open','transition.open'] as const) expect(homes.has(id)).toBe(true);
  });
  it('keeps camera resets, grid and display settings out of project history and exposes palette alternatives',()=>{
    const store=setup(),original=store.getState().project;
    store.dispatch('display.grid');expect(store.getState().ui.showGrid).toBe(false);
    store.dispatch('view.select',{view:'3d'});store.dispatch('view.camera',{preset:'front'});
    const version=store.getState().ui.camera.version;
    expect(all(fieldToolbar(store.getState())).filter(a=>a.active).map(a=>a.label)).toEqual(['Front']);
    store.dispatch('view.camera',{preset:'front'});expect(store.getState().ui.camera.version).toBe(version+1);
    expect(paletteEntries(store.getState()).some(e=>e.invocation.id==='display.grid')).toBe(true);
    expect(paletteEntries(store.getState()).filter(e=>e.invocation.id==='view.camera')).toHaveLength(3);
    expect(store.getState().project).toBe(original);
  });
});
