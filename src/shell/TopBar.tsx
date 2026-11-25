import { BookOpen, ChevronDown, CircleHelp, Download, FilePlus2, FolderOpen, History as HistoryIcon, LayoutPanelLeft, LifeBuoy, Redo2, Save, SaveAll, Search, Settings2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { CommandKeycaps, HelpButton } from '../editor/ControlHelp';
import { ProblemTimelineLabel } from '../editor/ProblemTimeline';
import { canSwitchWorkspace } from '../editor/workspaceCommands';
import type { EditorController } from '../editor/useEditorController';
import { Menu, type MenuEntry } from '../ui/Menu';
import { SquidMark } from '../ui/icons';
import { SHELL_MODES, type ShellLayout } from './useShellLayout';

/** The always-present bar: project, mode, history, search and export. */
export function TopBar({ controller: c, layout, onWorkspaces }: { controller: EditorController; layout: ShellLayout; onWorkspaces: () => void }) {
  const { project, dirty, canUndo, canRedo, setDialog } = c;
  const busy = !!c.fileOperation;
  const narrow = layout.breakpoints.header === 'narrow', compact = layout.breakpoints.header !== 'full';
  const openCommands = () => { if (!c.dispatch('palette.open')) c.notify('Finish or cancel the pending edit before opening commands.'); };
  const switchLocked = !canSwitchWorkspace(c.store.getState());

  const menu: MenuEntry[] = [
    { label: 'New production…', icon: <FilePlus2 size={15} />, command: 'file.new', onSelect: () => setDialog('new') },
    { label: 'Open…', name: 'Open project', icon: <FolderOpen size={15} />, command: 'file.open', disabled: busy, disabledReason: 'Wait for the current file operation to finish.', onSelect: () => void c.openProject() },
    { type: 'separator' },
    { label: 'Save', icon: <Save size={15} />, command: 'file.save', disabled: busy, disabledReason: 'Wait for the current file operation to finish.', onSelect: () => void c.saveProject() },
    { label: 'Save as…', icon: <SaveAll size={15} />, command: 'file.save-as', disabled: busy, disabledReason: 'Wait for the current file operation to finish.', onSelect: () => void c.saveProject(true) },
    { label: 'Export…', icon: <Download size={15} />, command: 'file.export', onSelect: () => setDialog('export') },
    { type: 'separator' },
    { label: 'Templates…', icon: <BookOpen size={15} />, command: 'templates.open', onSelect: () => { c.dispatch('templates.open'); } },
    { label: 'Recovery copies…', icon: <LifeBuoy size={15} />, description: 'Review local recovery copies and choose one to restore.', onSelect: () => { setDialog('recovery'); void c.recovery.refresh(); } },
    { label: 'History…', icon: <HistoryIcon size={15} />, command: 'history.open', onSelect: () => setDialog('history') },
    { type: 'separator' },
    { label: 'Production settings…', icon: <Settings2 size={15} />, command: 'project.update', description: 'Title, ensemble, field, sections and audio offset.', onSelect: () => setDialog('settings') },
    { label: 'Preferences…', icon: <SlidersHorizontal size={15} />, command: 'preferences.open', description: 'Personal display and editing defaults for this device.', onSelect: () => setDialog('preferences') },
    { label: 'Workspaces…', icon: <LayoutPanelLeft size={15} />, description: 'Switch, save, rename or reset arrangements of the window on this device.', onSelect: onWorkspaces },
    { type: 'separator' },
    { label: 'Help and shortcuts', name: 'Help', icon: <CircleHelp size={15} />, command: 'help.open', onSelect: () => setDialog('help') },
  ];

  return <header className="app-header topbar">
    <div className="topbar-start">
      <Menu label="Project menu" description="File actions, templates, recovery, production settings, preferences and Help." className="app-menu" menuClassName="dropdown" items={menu}>
        <SquidMark size={22} /><ChevronDown size={12} />
      </Menu>
      <div className="project-file-state">
        <HelpButton pointerPassThrough title="Production settings" command="project.update" description="Rename the production and edit its ensemble, field and sections." className="project-title" onClick={() => setDialog('settings')}>
          <span>{project.title}</span>
        </HelpButton>
        <span className={`save-state${dirty ? ' save-state--unsaved' : ''}`} role="status" aria-live="polite">
          <span className={`status-dot ${dirty ? 'unsaved' : c.savedRevision === null ? 'idle' : ''}`} />
          <span className="save-state-text">{c.fileStatus}</span>
        </span>
        <HelpButton title="Recovery copies" description="Squidware keeps automatic local recovery copies of your work. Review them here." className="recovery-indicator" onClick={() => { setDialog('recovery'); void c.recovery.refresh(); }}>{c.recovery.status}</HelpButton>
        {dirty && <HelpButton command="file.save" title="Save" state="Unsaved changes" disabled={busy} disabledReason="Wait for the current file operation to finish." className="button small header-save" onClick={() => void c.saveProject()}>Save</HelpButton>}
      </div>
    </div>

    <nav className="mode-switch segmented" aria-label="Workflow">
      {SHELL_MODES.map(mode => <HelpButton pointerPassThrough key={mode.id} title={`${mode.label} mode`} description={mode.description} command={`workspace.${mode.workspace}`}
        aria-pressed={layout.mode === mode.id} disabled={switchLocked} disabledReason="Finish the active preview, gesture or dialog first."
        onClick={() => { if (layout.mode !== mode.id || c.preferences.value.workspaces.active !== mode.workspace) c.dispatch('workspace.select', { id: mode.workspace }); }}>
        {mode.label}
      </HelpButton>)}
    </nav>

    <div className="topbar-end header-actions">
      <HelpButton command="history.undo" title="Undo" className="icon-button" disabledReason="There are no earlier edits to undo, or an edit is still in progress." onClick={c.undoDrill} disabled={!canUndo}><Undo2 size={16} /></HelpButton>
      <HelpButton command="history.redo" title="Redo" className="icon-button" disabledReason="There are no undone edits to restore, or an edit is still in progress." onClick={c.redoDrill} disabled={!canRedo}><Redo2 size={16} /></HelpButton>
      <span className="divider-vertical" />
      <ProblemTimelineLabel />
      <HelpButton command="palette.open" title="Command palette" description="Search every action, setting and drill phrase." className={`command-search${compact ? ' command-search--compact' : ''}`} onClick={openCommands}>
        <Search size={14} />{!compact && <span>Search actions</span>}<CommandKeycaps command="palette.open" />
      </HelpButton>
      <HelpButton command="file.export" title="Export" className="button topbar-export" onClick={() => setDialog('export')}>
        <Download size={14} />{!narrow && <span>Export</span>}
      </HelpButton>
    </div>
  </header>;
}
