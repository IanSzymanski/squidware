import { activeWorkspace } from '../workspaces';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';


import { BookOpen, Check, CircleHelp, Download, FilePlus2, Focus, FolderOpen, History as HistoryIcon, Maximize, MoreHorizontal, Redo2, RotateCcw, Save, Search, Settings2, SlidersHorizontal, Undo2, X } from 'lucide-react';

import { DEFAULT_SNAPPING, fieldSnapStatus } from '../snapping';


import { PrintOutput } from '../components/PrintOutput';

import { Button } from './EditorControls';
import { SelectionTools, SectionSelectionButton, revealFocusedChip } from './SelectionTools';
import { HelpButton, CommandKeycaps } from './ControlHelp';

import { useEditorController } from './useEditorController';
import { FieldToolbar } from './FieldToolbar';
import { EditorField } from './EditorField';
import { EditorInspector } from './EditorInspector';
import { SetListPanel } from './SetListPanel';
import { EditorTimeline } from './EditorTimeline';
import { EditorDialogs } from './EditorDialogs';
import { CommandPalette } from './CommandPalette';
import { useEditorSelector } from './react';
import { CastWorkspace } from './CastWorkspace';
import { ProductionWorkspace } from './ProductionWorkspace';
import { FocusFieldButton, WorkspacePane, useWorkspaceLayout } from './WorkspaceLayout';
import { Popout3D } from './Popout3D';

export function EditorShell() {
  const controller = useEditorController();
  const layout = useWorkspaceLayout(controller);
  const paletteOpen = useEditorSelector(state => state.ui.paletteOpen);
  const openCommands = () => { if (!controller.dispatch('palette.open')) controller.notify('Finish or cancel the pending edit before opening commands.'); };
  const { project, projectEpoch, canUndo, canRedo, workspace, snap, setDialog, menu, setMenu, toast, setToast, printMode, printing, audioUrl, muted, audioRef, audioInput, projectInput, rosterInput, dirty, undoDrill, redoDrill, saveProject, openProject, onProjectFile, onAudioFile, onRosterFile } = controller;
  const bp = layout.breakpoints; const compactHeader = bp.header !== 'full';
  const arrangement = activeWorkspace(controller.preferences.value.workspaces).arrangement;
  return <>
    <div ref={layout.studio} style={layout.studioStyle} data-header={bp.header} data-transport={bp.transport} data-height={bp.short ? 'short' : 'tall'} data-timeline={arrangement.timeline} className={`studio studio--${controller.preferences.value.panelLayout}${workspace === 'design' && controller.castPanelOpen ? ' studio--cast-panel' : ''}${layout.focusMode ? ' studio--focus' : ''}`}>
      <header className="app-header">
        <div className="brand"><img src="./squid.svg" alt="Squidware logo" /><span>squidware<span className="brand-dot">.</span></span></div>
        <div className="header-divider" />
        <div className="project-file-state">
          <div className="project-title"><span>{project.title}</span></div>
          <span className={`save-state${dirty ? ' save-state--unsaved' : ''}`} role="status" aria-live="polite"><span className={`status-dot ${dirty ? 'unsaved' : controller.savedRevision === null ? 'idle' : ''}`} />{controller.fileStatus}</span>
        </div>
        <WorkspaceSwitcher controller={controller} layout={layout} />
        {/* Below the compact breakpoint Layout, Focus field, Help and History move into Menu, in the same order. */}
        <div className="header-actions"><Button title="Command palette" command="palette.open" onClick={openCommands}><Search size={17} /></Button>
          {!compactHeader && <><FocusFieldButton controller={controller} layout={layout} className="icon-button"><Focus size={17} /></FocusFieldButton><HelpButton command="help.open" title="Help" className="button subtle help-action" onClick={() => setDialog('help')}><CircleHelp size={21} />Help</HelpButton><Button command="history.open" title="History" onClick={() => setDialog('history')}><HistoryIcon size={17} /></Button></>}
          <Button command="history.undo" title="Undo" disabledReason="There are no earlier edits to undo, or an edit is still in progress." onClick={undoDrill} disabled={!canUndo}><Undo2 size={17} /></Button><Button command="history.redo" title="Redo" disabledReason="There are no undone edits to restore, or an edit is still in progress." onClick={redoDrill} disabled={!canRedo}><Redo2 size={17} /></Button><div className="header-divider" /><HelpButton command="file.save" title="Save" state={dirty ? 'Unsaved changes' : undefined} disabledReason="Wait for the current file operation to finish." className="button subtle header-save" disabled={!!controller.fileOperation} onClick={() => void saveProject()}><Save size={15} /><span className="header-label">Save</span>{dirty ? ' •' : ''}</HelpButton><HelpButton command="file.export" title="Export" className="button primary" onClick={() => setDialog('export')}><Download size={15} />Export</HelpButton>
          {/* An open Menu takes Escape first, as More playback options does: it closes and returns focus to its button
            before any editor-wide Escape (cancelling a preview or clearing the selection) runs. */}
          <div className="file-menu" data-escape-scope={menu || undefined} onKeyDown={event => { if (!menu || event.key !== 'Escape' || event.nativeEvent.isComposing) return; event.preventDefault(); event.stopPropagation(); setMenu(false); event.currentTarget.querySelector<HTMLElement>('[aria-label="Project menu"]')?.focus(); }}><Button title="Project menu" description={compactHeader ? 'Open layout, focus, Help, History, file actions, production settings and personal preferences.' : 'Open file actions, production settings and personal preferences.'} active={menu} onClick={() => setMenu(!menu)}><MoreHorizontal size={20} /><span className="header-label">Menu</span></Button>{menu && <><div className="menu-dismiss" onClick={() => setMenu(false)} /><div className="dropdown">
            {compactHeader && <><FocusFieldButton controller={controller} layout={layout}><Focus size={16} />Focus field<CommandKeycaps command="layout.focus" /></FocusFieldButton><HelpButton command="help.open" title="Help" onClick={() => { setDialog('help'); setMenu(false); }}><CircleHelp size={16} />Help<CommandKeycaps command="help.open" /></HelpButton><HelpButton command="history.open" title="History" onClick={() => { setDialog('history'); setMenu(false); }}><HistoryIcon size={16} />History<CommandKeycaps command="history.open" /></HelpButton><hr /></>}
            <HelpButton command="palette.open" title="Command palette" onClick={openCommands}><Search size={16} />Commands<CommandKeycaps command="palette.open" /></HelpButton><HelpButton command="file.new" title="New production" onClick={() => { setDialog('new'); setMenu(false); }}><FilePlus2 size={16} />New production<CommandKeycaps command="file.new" /></HelpButton><HelpButton command="file.open" title="Open project" disabledReason="Wait for the current file operation to finish." disabled={!!controller.fileOperation} onClick={() => void openProject()}><FolderOpen size={16} />Open project<CommandKeycaps command="file.open" /></HelpButton><HelpButton command="file.save-as" title="Save as" disabledReason="Wait for the current file operation to finish." disabled={!!controller.fileOperation} onClick={() => { void saveProject(true); setMenu(false); }}><Save size={16} />Save as…</HelpButton><hr /><HelpButton command="templates.open" title="Templates" onClick={() => { controller.dispatch('templates.open'); }}><BookOpen size={16} />Templates…</HelpButton><HelpButton title="Recovery copies" description="Review local recovery copies and choose one to restore." onClick={() => { setDialog('recovery'); setMenu(false); void controller.recovery.refresh(); }}><RotateCcw size={16} />Recovery copies</HelpButton><HelpButton command="project.update" title="Production settings" onClick={() => { setDialog('settings'); setMenu(false); }}><Settings2 size={16} />Production settings</HelpButton><HelpButton command="preferences.open" title="Preferences" description="Choose personal display and editing defaults for this device." onClick={() => { setDialog('preferences'); setMenu(false); }}><SlidersHorizontal size={16} />Preferences</HelpButton></div></>}</div>
</div>
      </header>
      {controller.preferences.value.workspaces.notice && <div className="workspace-recovery" role="status">{controller.preferences.value.workspaces.notice}<button onClick={() => controller.preferences.update({ workspaces: { ...controller.preferences.value.workspaces, notice: '' } })}>Dismiss</button></div>}
      <div className="studio-body" ref={layout.body} data-preview-overlay={layout.preview && layout.overlay ? layout.overlay === 'sets' ? 'left' : 'right' : undefined}>
        {layout.focusMode && <HelpButton pointerPassThrough title="Exit focus" description="Restore panels and workspace navigation. Escape also exits focus." className="focus-restore" onClick={layout.toggleFocus}><Maximize size={16} />Exit focus · Esc</HelpButton>}
        {/* A preview's subject stays visible: no scrim hides the field, its banner or the transport while one runs. */}
        {layout.overlay && !layout.preview && <div className="workspace-overlay-dismiss" onClick={layout.dismiss} />}
        <WorkspacePane pane="sets" layout={layout}>
        <SetListPanel controller={controller} /></WorkspacePane>
        <main className="main-workspace">
          {workspace === 'production' && <div className="workspace-heading"><h1>Production sheet<span>{project.performers.length} PERFORMERS</span></h1></div>}
          <div className="workspace-field" hidden={workspace === 'production'} inert={workspace === 'production'}><FieldToolbar controller={controller} />
              <EditorField controller={controller}><div className="field-legend" role="group" aria-label="Select a section"><div className="field-legend-scroll" onFocus={revealFocusedChip}>{project.sections.map(section => <SectionSelectionButton section={section} controller={controller} key={section.id} />)}</div></div></EditorField></div>
          <div className="workspace-sheet" hidden={workspace !== 'production'} inert={workspace !== 'production'}><ProductionWorkspace key={controller.projectEpoch} controller={controller} /></div>
          <EditorTimeline controller={controller} transport={layout.breakpoints.transport} />
        </main>
        <WorkspacePane pane={layout.side} layout={layout}><div id="panel-content-inspector" role="tabpanel" aria-labelledby="panel-tab-inspector" className="workspace-tab-content" hidden={layout.side !== 'inspector'} inert={layout.side !== 'inspector'}><EditorInspector controller={controller} /></div><div id="panel-content-cast" role="tabpanel" aria-labelledby="panel-tab-cast" className="workspace-tab-content" hidden={layout.side !== 'cast'} inert={layout.side !== 'cast'}><CastWorkspace controller={controller} docked /></div></WorkspacePane>
      </div>
      <footer className="statusbar"><HelpButton title="Recovery copies" description="Review automatic local recovery copies." className="recovery-indicator" onClick={() => { setDialog('recovery'); void controller.recovery.refresh(); }}>{controller.recovery.status}</HelpButton><span>{controller.preferences.value.showHints && !controller.preferences.value.selectionHintDismissed && <><span data-hint="">Shift + click to select multiple</span><i /></>}<span className="statusbar-field">{project.field.preset === 'college' ? 'College' : 'High school'} field</span><i /><span className="statusbar-snap" role="status">{fieldSnapStatus(project.snapping ?? DEFAULT_SNAPPING, snap, controller.coordinatePreview ? 'coordinates' : controller.spacingPreview ? 'spacing' : undefined)}</span></span></footer>
    </div>
    <input ref={projectInput} type="file" accept=".squid,.json" hidden onChange={event => void onProjectFile(event)} /><input ref={rosterInput} type="file" accept=".csv" hidden onChange={event => void onRosterFile(event)} /><input ref={audioInput} type="file" accept="audio/*" hidden onChange={event => void onAudioFile(event)} /><audio ref={audioRef} src={audioUrl || undefined} muted={muted} preload="auto" />
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><HelpButton title="Dismiss notification" description="Close this notification." onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></HelpButton></div>}
    <SelectionTools controller={controller} />
    <Popout3D controller={controller} />
    {paletteOpen && <CommandPalette />}
    <EditorDialogs key={projectEpoch} controller={controller} />
    {printing && <PrintOutput project={project} mode={printMode} paper={controller.preferences.value.paperSize} coordinateFormat={controller.coordinateFormat} />}
  </>;
}

EditorShell.displayName = 'EditorShell';
