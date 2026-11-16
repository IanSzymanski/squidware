import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { activeWorkspace, isBuiltInWorkspace } from '../workspaces';
import { paneLimits, paneNames } from '../workspaceLayout';
import { uiScale } from '../uiScale';
import { canSwitchWorkspace } from './workspaceCommands';
import { HelpButton, CommandKeycaps } from './ControlHelp';
import type { EditorController } from './useEditorController';
import type { WorkspaceLayoutController } from './WorkspaceLayout';

/** A single, always-labelled header control owns workspace selection and arrangement management. */
export function WorkspaceSwitcher({ controller: c, layout: l }: { controller: EditorController; layout: WorkspaceLayoutController }) {
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef(false);
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<'save' | 'rename' | null>(null), [name, setName] = useState('');
  const w = c.preferences.value.workspaces, active = activeWorkspace(w), a = active.arrangement;
  const locked = !canSwitchWorkspace(c.store.getState());
  const close = () => { setOpen(false); setEditing(null); root.current?.querySelector<HTMLButtonElement>('.workspace-trigger')?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) { setOpen(false); setEditing(null); } };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (open) root.current?.querySelector<HTMLButtonElement>('.workspace-choice[aria-pressed=true]')?.focus(pointer.current ? { focusVisible: false } as FocusOptions : undefined); }, [open]);
  const rect = root.current?.querySelector('.workspace-trigger')?.getBoundingClientRect();
  const submit = () => { if (c.dispatch(editing === 'save' ? 'workspace.save' : 'workspace.rename', editing === 'save' ? { name } : { id: w.active, name }) === true) { setEditing(null); setName(''); } };
  return <div className="workspace-switcher" data-preserve-drafts="" ref={root} data-escape-scope={open || undefined}
    onPointerDown={e => { if (!open && e.target instanceof Element && e.target.closest('button')) e.preventDefault(); }}
    onKeyDown={e => { if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }}>
    <HelpButton pointerPassThrough title="Switch workspace" description="Choose an arrangement, save a named workspace, or change panels and timeline on this device." state={active.name} className="button subtle workspace-trigger" aria-expanded={open} aria-controls="workspace-options" onClick={e => { pointer.current = e.detail > 0; setOpen(!open); }}><span>{active.name}</span><ChevronDown size={14} /></HelpButton>
    {open && <div id="workspace-options" role="region" aria-label="Workspaces" className="layout-popover workspace-options" style={{ top: (rect?.bottom ?? 48) / uiScale() + 6, left: Math.max(8, Math.min((rect?.left ?? 8) / uiScale(), window.innerWidth / uiScale() - 370)), maxHeight: Math.max(120, (window.innerHeight - (rect?.bottom ?? 48)) / uiScale() - 18) }}>
      <div className="layout-popover-heading"><strong>Workspaces</strong><button aria-label="Close workspace options" onClick={close}><X size={16} /></button></div>
      <div className="workspace-choices" role="group" aria-label="Choose workspace">{w.entries.map(entry => <HelpButton pointerPassThrough key={entry.id} title={`${entry.name} workspace`} description="Switch the arrangement without changing production data." command={isBuiltInWorkspace(entry.id) ? `workspace.${entry.id}` : 'workspace.select'} className="button subtle workspace-choice" aria-pressed={w.active === entry.id} disabled={locked} disabledReason="Finish the active preview, gesture or dialog first." onClick={() => { if (c.dispatch('workspace.select', { id: entry.id })) close(); }}><span>{w.active === entry.id && <Check size={14} />}{entry.name}</span>{isBuiltInWorkspace(entry.id) && <CommandKeycaps command={`workspace.${entry.id}`} />}</HelpButton>)}</div>
      <p>Arrange tools for this task. Every feature stays available through panels and Commands.</p>
      <div className="workspace-arrangement">
        <label>Right panel<select aria-label="Workspace right panel" value={c.castPanelOpen ? 'cast' : 'inspector'} disabled={locked} onChange={e => c.dispatch('workspace.update', { update: { rightPanel: e.target.value as 'cast' | 'inspector' } })}><option value="inspector">Inspector</option><option value="cast">Cast</option></select></label>
        <label>Toolbar<select aria-label="Workspace toolbar" value={a.toolbar} disabled={locked} onChange={e => c.dispatch('workspace.update', { update: { toolbar: e.target.value as 'contextual' | 'rehearsal' } })}><option value="contextual">Contextual editing</option><option value="rehearsal">Rehearsal</option></select></label>
        <label>Timeline<select aria-label="Workspace timeline" value={a.timeline} disabled={locked} onChange={e => c.dispatch('workspace.update', { update: { timeline: e.target.value as 'compact' | 'full' } })}><option value="compact">Compact</option><option value="full">Full</option></select></label>
        <label>Default view<select aria-label="Workspace default view" value={c.view} disabled={locked} onChange={e => c.dispatch('workspace.update', { update: { view: e.target.value as '2d' | '3d' } })}><option value="2d">2D field</option><option value="3d">3D rehearsal</option></select></label>
        <label><input type="checkbox" aria-label="Workspace Production sheet" checked={c.workspace === 'production'} disabled={locked} onChange={e => c.dispatch('workspace.update', { update: { sheet: e.target.checked } })} />Production sheet</label>
      </div>
      {(['sets', 'inspector', 'cast'] as const).map(pane => <div className="layout-pane-option" key={pane}>
        <label><input type="checkbox" aria-label={`Workspace ${paneNames[pane]}`} disabled={locked} checked={!l.layout[`${pane}Collapsed`]} onChange={e => l.update({ [`${pane}Collapsed`]: !e.target.checked })} />{paneNames[pane]}</label>
        <label>Width <input aria-label={`${paneNames[pane]} width`} type="range" min={paneLimits[pane][0]} max={paneLimits[pane][1]} value={l.layout[`${pane}Width`]} disabled={locked} onChange={e => l.update({ [`${pane}Width`]: Number(e.target.value) })} /><output>{l.layout[`${pane}Width`]} px</output></label>
      </div>)}
      {editing ? <form onSubmit={e => { e.preventDefault(); submit(); }} className="workspace-name-form"><label>{editing === 'save' ? 'New workspace name' : 'Workspace name'}<input autoFocus aria-label="Workspace name" maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label><button className="button primary" disabled={!name.trim()}>Save</button><button className="button subtle" type="button" onClick={() => setEditing(null)}>Cancel</button></form> : <div className="workspace-manage">
        <button className="button subtle" disabled={locked || w.entries.length >= 20} onClick={() => { setEditing('save'); setName(''); }}>Save as…</button>
        <button className="button subtle" disabled={locked} onClick={() => { setEditing('rename'); setName(active.name); }}>Rename…</button>
        {isBuiltInWorkspace(w.active) ? <button className="button subtle" disabled={locked} onClick={() => c.dispatch('workspace.reset', { id: w.active })}>Reset to defaults</button> : <button className="button subtle" disabled={locked} onClick={() => { if (c.dispatch('workspace.delete', { id: w.active })) close(); }}>Delete custom workspace</button>}
      </div>}
      {locked && <p role="status">Finish the active preview, gesture or dialog first.</p>}
    </div>}
  </div>;
}
