import { describe, expect, it } from 'vitest';
import { defaultPreferences, validatePreferences } from './preferences';
import { activeWorkspace, builtInWorkspace, defaultWorkspaces, validateWorkspaces } from './workspaces';
import { workspacePreset } from './workspaceLayout';
import { createEditorStore } from './editor/store';
import { createDemoProject, serializeProject } from './domain';
import { preferencesSnapshot, startPreferencesController } from './editor/preferencesController';

function editor() { const s = createEditorStore(createDemoProject()); s.setValue('preferences','status','saved'); return s; }
describe('personal workspaces', () => {
  it.each(['write','review','rehearse','custom'] as const)('migrates %s without losing widths, collapsed panels, Cast or view', preset => {
    const layout = { ...workspacePreset(preset === 'custom' ? 'write' : preset), preset, setsWidth: 275, castCollapsed: true };
    const p = validatePreferences({ workspaceLayout: layout, castPanelOpen: true, view: '3d', theme: 'light' });
    expect(activeWorkspace(p.workspaces).arrangement).toMatchObject({ layout, rightPanel: 'cast', view: '3d' });
    expect(p.theme).toBe('light');
    expect(p.workspaces.active).toBe(preset === 'review' ? 'field' : preset === 'custom' ? 'custom-migrated' : preset === 'write' ? 'design' : 'rehearse');
  });
  it('recovers corrupted entries locally with a Design fallback and a notice', () => {
    const w = defaultWorkspaces(); w.active = 'custom-valid'; w.entries.push({ ...builtInWorkspace('field'), id:'custom-valid', name:'Writing' });
    const source = { ...defaultPreferences(), theme:'light', workspaces:{...w,entries:[...w.entries,{id:'custom-broken',name:'Broken',arrangement:null}]} };
    const p = validatePreferences(source);
    expect(p.workspaces.active).toBe('design'); expect(p.workspaces.notice).toContain('could not be read');
    expect(p.workspaces.entries.some(w=>w.id==='custom-valid')).toBe(true); expect(p.theme).toBe('light');
    expect(validateWorkspaces({active:'missing',entries:[]}).notice).toBeTruthy();
  });
  it('switches layouts with selection, playhead, pending drafts and project history intact', () => {
    const s=editor(); s.setValue('selection','selectedIds',[s.getState().project.present.performers[0].id]); s.setValue('playback','count',5); s.setValue('ui','pendingDraft',true);
    const before=s.getState(), file=serializeProject(before.project.present);
    for(const id of ['field','production','rehearse','design']) {
      expect(s.dispatch('workspace.select',{id})).toBe(true);
      expect(s.getState().selection).toBe(before.selection); expect(s.getState().playback).toBe(before.playback);
      expect(s.getState().project).toBe(before.project); expect(s.getState().ui.pendingDraft).toBe(true);
    }
    expect(serializeProject(s.getState().project.present)).toBe(file);
  });
  it('saves, renames, reopens, resets and deletes arrangements without project edits', async () => {
    const s=editor(); s.dispatch('layout.update',{update:{setsWidth:300}}); s.dispatch('workspace.update',{update:{timeline:'compact',rightPanel:'cast'}});
    expect(s.dispatch('workspace.save',{name:'My writing'})).toBe(true); const id=s.getState().preferences.value.workspaces.active;
    expect(s.dispatch('workspace.rename',{id,name:'Daily writing'})).toBe(true);
    expect(s.dispatch('workspace.save',{name:'design'})).toBe(false);
    const saved=preferencesSnapshot(s.getState());
    const fresh=editor(); const prefs=startPreferencesController(fresh,{readPreferences:async()=>({preferences:saved}),savePreferences:async()=>{},resetPreferences:async()=>defaultPreferences()});
    await prefs.ready; expect(fresh.getState().preferences.value.workspaceLayout.setsWidth).toBe(300); expect(fresh.getState().ui.castPanelOpen).toBe(true);
    expect(activeWorkspace(fresh.getState().preferences.value.workspaces).name).toBe('Daily writing');
    fresh.dispatch('workspace.select',{id:'field'}); fresh.dispatch('layout.update',{update:{setsWidth:320}}); fresh.dispatch('workspace.reset',{id:'field'});
    expect(fresh.getState().preferences.value.workspaceLayout).toEqual(builtInWorkspace('field').arrangement.layout);
    fresh.dispatch('workspace.select',{id}); fresh.dispatch('workspace.delete',{id}); expect(fresh.getState().preferences.value.workspaces.active).toBe('design');
    expect(fresh.getState().project.past).toHaveLength(0); prefs.stop();
  });
  it('keeps previews intact by declining a switch until Apply or Cancel', () => {
    const s=editor(); s.setValue('selection','selectedIds',[s.getState().project.present.performers[0].id]); s.dispatch('transform.preview',{});
    const session=s.getState().ui.transformPreview; expect(session).toBeTruthy(); expect(s.dispatch('workspace.field')).toBe(false); expect(s.getState().ui.transformPreview).toBe(session);
  });
});
