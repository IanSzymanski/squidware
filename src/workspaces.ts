import { validateWorkspaceLayout, workspacePreset, type WorkspaceLayout } from './workspaceLayout';

export const builtInWorkspaceIds = ['field', 'design', 'production', 'rehearse'] as const;
export type BuiltInWorkspaceId = typeof builtInWorkspaceIds[number];
export interface WorkspaceArrangement {
  layout: WorkspaceLayout;
  rightPanel: 'inspector' | 'cast';
  toolbar: 'contextual' | 'rehearsal';
  timeline: 'compact' | 'full';
  view: '2d' | '3d';
  sheet: boolean;
}
export interface SavedWorkspace { id: string; name: string; arrangement: WorkspaceArrangement }
export interface Workspaces { active: string; entries: SavedWorkspace[]; notice: string }
export const isBuiltInWorkspace = (id: string): id is BuiltInWorkspaceId => (builtInWorkspaceIds as readonly string[]).includes(id);
export function builtInWorkspace(id: BuiltInWorkspaceId): SavedWorkspace {
  return { id, name: id[0].toUpperCase() + id.slice(1), arrangement: {
    layout: workspacePreset(id === 'design' || id === 'production' ? 'write' : 'rehearse'),
    rightPanel: id === 'production' ? 'cast' : 'inspector', toolbar: id === 'rehearse' ? 'rehearsal' : 'contextual',
    timeline: id === 'field' || id === 'production' ? 'compact' : 'full', view: id === 'rehearse' ? '3d' : '2d', sheet: id === 'production',
  } };
}
export const defaultWorkspaces = (): Workspaces => ({ active: 'design', entries: builtInWorkspaceIds.map(builtInWorkspace), notice: '' });
export const activeWorkspace = (workspaces: Workspaces) => workspaces.entries.find(w => w.id === workspaces.active)!;
export function workspaceName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 40 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Use a workspace name of 1–40 characters.');
  return value.trim();
}
export function validateArrangement(input: unknown): WorkspaceArrangement {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid workspace arrangement.');
  const a = input as WorkspaceArrangement;
  if (!['inspector', 'cast'].includes(a.rightPanel) || !['contextual', 'rehearsal'].includes(a.toolbar) || !['compact', 'full'].includes(a.timeline) || !['2d', '3d'].includes(a.view) || typeof a.sheet !== 'boolean' || !a.layout || typeof a.layout !== 'object') throw new Error('Invalid workspace arrangement.');
  return { layout: validateWorkspaceLayout(a.layout), rightPanel: a.rightPanel, toolbar: a.toolbar, timeline: a.timeline, view: a.view, sheet: a.sheet };
}
/** Validate each entry independently. Preserve healthy custom arrangements and unrelated preferences on recovery. */
export function validateWorkspaces(input: unknown): Workspaces {
  const defaults = defaultWorkspaces();
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    const source = input as Workspaces;
    if (!Array.isArray(source.entries) || source.entries.length > 20) throw new Error();
    const entries = new Map(defaults.entries.map(w => [w.id, w]));
    let recovered = false;
    const ids = new Set<string>(); const names = new Set<string>();
    for (const entry of source.entries) {
      try {
        if (!entry || typeof entry.id !== 'string' || !/^(field|design|production|rehearse|custom-[a-zA-Z0-9-]{1,64})$/.test(entry.id) || ids.has(entry.id)) throw new Error();
        const name = workspaceName(entry.name);
        if (names.has(name.toLowerCase())) throw new Error();
        const arrangement = validateArrangement(entry.arrangement);
        ids.add(entry.id); names.add(name.toLowerCase()); entries.set(entry.id, { id: entry.id, name, arrangement });
      } catch { recovered = true; }
    }
    if (!entries.has(source.active) || !ids.has(source.active)) recovered = true;
    if (recovered) entries.set('design', builtInWorkspace('design'));
    return { active: recovered ? 'design' : source.active, entries: [...entries.values()], notice: recovered ? 'A saved workspace could not be read. Design was restored; other personal preferences were kept.' : typeof source.notice === 'string' ? source.notice.slice(0,240) : '' };
  } catch { return { ...defaults, notice: 'Saved workspaces could not be read. Design was restored; other personal preferences were kept.' }; }
}
export function migrateWorkspaces(layout: WorkspaceLayout, castPanelOpen: boolean, view: '2d' | '3d'): Workspaces {
  const result = defaultWorkspaces();
  const id = layout.preset === 'rehearse' ? 'rehearse' : layout.preset === 'review' ? 'field' : layout.preset === 'custom' ? 'custom-migrated' : 'design';
  const entry: SavedWorkspace = { ...builtInWorkspace(id === 'custom-migrated' ? 'design' : id), id, name: id === 'custom-migrated' ? 'My layout' : builtInWorkspace(id).name,
    arrangement: { ...builtInWorkspace(id === 'custom-migrated' ? 'design' : id).arrangement, layout, rightPanel: castPanelOpen ? 'cast' : 'inspector', view } };
  result.active = id;
  result.entries = isBuiltInWorkspace(id) ? result.entries.map(w => w.id === id ? entry : w) : result.entries.concat(entry);
  return result;
}
