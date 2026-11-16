import { uid } from '../domain';
import { activeWorkspace, builtInWorkspace, isBuiltInWorkspace, workspaceName, validateArrangement, type WorkspaceArrangement } from '../workspaces';
import type { CommandContext } from './commands';
import type { EditorState } from './state';

export const canSwitchWorkspace = (s: EditorState) => s.preferences.status !== 'loading' && !s.ui.dialog && !s.ui.confirmation && !s.project.transactionName && !s.ui.selectionPreview && !s.ui.transformPreview && !s.ui.formationPreview && !s.ui.spacingPreview && !s.ui.coordinatePreview;
export function captureWorkspace(s: EditorState): WorkspaceArrangement {
  return { ...activeWorkspace(s.preferences.value.workspaces).arrangement, layout: s.preferences.value.workspaceLayout, rightPanel: s.ui.castPanelOpen ? 'cast' : 'inspector', view: s.ui.view, sheet: s.ui.workspace === 'production' };
}
export function switchWorkspace(c: CommandContext, id: string, reset = false) {
  const s = c.getState(), p = s.preferences.value, w = p.workspaces;
  let entries = w.entries.map(e => e.id === w.active ? { ...e, arrangement: captureWorkspace(s) } : e);
  if (reset && isBuiltInWorkspace(id)) entries = entries.map(e => e.id === id ? builtInWorkspace(id) : e);
  const target = entries.find(e => e.id === id); if (!target) throw new Error('This workspace is no longer available.');
  const a = target.arrangement;
  c.patch('preferences', { value: { ...p, workspaces: { ...w, active: id, entries, notice: '' }, workspaceLayout: a.layout, castPanelOpen: a.rightPanel === 'cast', view: a.view } });
  c.patch('ui', { workspace: a.sheet ? 'production' : 'design', workspaceVersion: s.ui.workspaceVersion + 1, castPanelOpen: a.rightPanel === 'cast', view: a.view, focusMode: false });
}
export function saveWorkspace(c: CommandContext, raw: string) {
  const s = c.getState(), p = s.preferences.value, w = p.workspaces, name = workspaceName(raw);
  if (w.entries.length >= 20) throw new Error('Keep at most 16 custom workspaces. Delete one before saving another.');
  if (w.entries.some(e => e.name.toLowerCase() === name.toLowerCase())) throw new Error('A workspace already uses this name.');
  if (['field','design','production','rehearse'].includes(name.toLowerCase())) throw new Error('Choose a name other than a built-in workspace name.');
  const entry = { id: `custom-${uid()}`, name, arrangement: captureWorkspace(s) };
  c.patch('preferences', { value: { ...p, workspaces: { ...w, active: entry.id, entries: w.entries.map(e => e.id === w.active ? { ...e, arrangement: captureWorkspace(s) } : e).concat(entry) } } });
}
export function renameWorkspace(c: CommandContext, id: string, raw: string) {
  const p = c.getState().preferences.value, name = workspaceName(raw);
  if (['field','design','production','rehearse'].includes(name.toLowerCase()) && name.toLowerCase() !== id) throw new Error('That name belongs to another built-in workspace.');
  if (p.workspaces.entries.some(e => e.id !== id && e.name.toLowerCase() === name.toLowerCase())) throw new Error('A workspace already uses this name.');
  c.patch('preferences', { value: { ...p, workspaces: { ...p.workspaces, entries: p.workspaces.entries.map(e => e.id === id ? { ...e, name } : e) } } });
}
export function updateWorkspace(c: CommandContext, update: Partial<Omit<WorkspaceArrangement, 'layout'>>) {
  const s = c.getState(), p = s.preferences.value, a = validateArrangement({ ...captureWorkspace(s), ...update });
  c.patch('preferences', { value: { ...p, workspaces: { ...p.workspaces, entries: p.workspaces.entries.map(e => e.id === p.workspaces.active ? { ...e, arrangement: a } : e) }, castPanelOpen: a.rightPanel === 'cast', view: a.view } });
  c.patch('ui', { workspace: a.sheet ? 'production' : 'design', castPanelOpen: a.rightPanel === 'cast', view: a.view });
}
