import { useState } from 'react';
import { Check, Maximize, Minus, Plus, X } from 'lucide-react';
import { PrintOutput } from '../components/PrintOutput';
import { CommandPalette } from '../editor/CommandPalette';
import { HelpButton } from '../editor/ControlHelp';
import { EditorDialogs } from '../editor/EditorDialogs';
import { EditorField } from '../editor/EditorField';
import { Popout3D } from '../editor/Popout3D';
import { ProductionWorkspace } from '../editor/ProductionWorkspace';
import { SelectionTools } from '../editor/SelectionTools';
import { useEditorSelector } from '../editor/react';
import { useEditorController } from '../editor/useEditorController';
import { ShowStrip } from './ShowStrip';
import { SidePanel } from './SidePanel';
import { RehearseReadout } from './RehearseReadout';
import { FieldHint, SnapStatus } from './StatusBar';
import { Toolbar, ViewControls } from './Toolbar';
import { TopBar } from './TopBar';
import { Welcome } from './Welcome';
import { WorkspacesDialog } from './WorkspacesDialog';
import { useShellLayout } from './useShellLayout';
import './shell.css';

/** The application window: one bar of project and mode, the field with its tools, a side panel, and the show strip. */
export function AppShell() {
  const controller = useEditorController();
  const layout = useShellLayout(controller);
  const paletteOpen = useEditorSelector(state => state.ui.paletteOpen);
  // The startup sample has nothing to lose: offer a fresh start over it. Automated runs open straight into the editor.
  const [welcome, setWelcome] = useState(() => !window.squidware?.legacyDemo && !new URLSearchParams(location.search).has('editor'));
  const { project, projectEpoch, toast, setToast, printMode, printing, audioUrl, muted, audioRef, audioInput, projectInput, rosterInput, onProjectFile, onAudioFile, onRosterFile } = controller;
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const openWorkspaces = () => setWorkspacesOpen(true);
  const planning = layout.mode === 'plan';
  const notice = controller.preferences.value.workspaces.notice;

  return <>
    <div ref={layout.studio} className={`studio studio--${controller.preferences.value.panelLayout}${layout.focusMode ? ' studio--focus' : ''}`}
      data-mode={layout.mode} data-header={layout.breakpoints.header} data-transport={layout.breakpoints.transport} data-height={layout.breakpoints.short ? 'short' : 'tall'} data-timeline={layout.arrangement.timeline}>
      <TopBar controller={controller} layout={layout} onWorkspaces={openWorkspaces} />
      {notice && <div className="workspace-recovery shell-notice" role="status">{notice}<button className="button small" onClick={() => controller.preferences.update({ workspaces: { ...controller.preferences.value.workspaces, notice: '' } })}>Dismiss</button></div>}
      <div className="studio-body">
        <main className="main-workspace">
          <div className="workspace-field" hidden={planning} inert={planning}>
            <Toolbar controller={controller} layout={layout} />
            <EditorField controller={controller}>
              <ViewControls controller={controller} layout={layout} onWorkspaces={openWorkspaces} />
              <FieldHint controller={controller} layout={layout} />
              {layout.mode === 'rehearse' && <RehearseReadout controller={controller} />}
              <div className="canvas-zoom-row">
                <SnapStatus controller={controller} />
                <div className="canvas-zoom" role="group" aria-label="Field zoom">
                  <HelpButton pointerPassThrough command="field.zoom-out" title="Zoom out" disabled={controller.zoom <= .6} disabledReason="The field is at its smallest zoom." onClick={() => controller.dispatch('field.zoom-out')}><Minus size={13} /></HelpButton>
                  <HelpButton pointerPassThrough command="field.fit" title="Fit field" description="Reset zoom and pan to show the whole field." className="zoom-value" onClick={() => controller.dispatch('field.fit')}>{Math.round(controller.zoom * 100)}%</HelpButton>
                  <HelpButton pointerPassThrough command="field.zoom-in" title="Zoom in" disabled={controller.zoom >= 3} disabledReason="The field is at its largest zoom." onClick={() => controller.dispatch('field.zoom-in')}><Plus size={13} /></HelpButton>
                </div>
              </div>
            </EditorField>
            {layout.focusMode && <HelpButton pointerPassThrough title="Exit focus" description="Restore the toolbar and panels. Escape also exits focus." className="focus-restore button" onClick={layout.toggleFocus}><Maximize size={14} />Exit focus<kbd>Esc</kbd></HelpButton>}
          </div>
          <div className="workspace-sheet" hidden={!planning} inert={!planning}><ProductionWorkspace key={projectEpoch} controller={controller} /></div>
        </main>
        {layout.overlay && !layout.preview && <div className="workspace-overlay-dismiss" onClick={layout.closeOverlay} />}
        <SidePanel controller={controller} layout={layout} />
      </div>
      <ShowStrip controller={controller} layout={layout} />
    </div>
    <input ref={projectInput} type="file" accept=".squid,.json" hidden onChange={event => void onProjectFile(event)} />
    <input ref={rosterInput} type="file" accept=".csv" hidden onChange={event => void onRosterFile(event)} />
    <input ref={audioInput} type="file" accept="audio/*" hidden onChange={event => void onAudioFile(event)} />
    <audio ref={audioRef} src={audioUrl || undefined} muted={muted} preload="auto" />
    {toast && <div className="toast" role="status"><Check size={15} /><span>{toast}</span><HelpButton title="Dismiss notification" description="Close this notification." onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></HelpButton></div>}
    <SelectionTools controller={controller} />
    <Popout3D controller={controller} />
    {paletteOpen && <CommandPalette />}
    <EditorDialogs key={projectEpoch} controller={controller} />
    {workspacesOpen && <WorkspacesDialog controller={controller} onClose={() => setWorkspacesOpen(false)} />}
    {welcome && !controller.dialog && !paletteOpen && <Welcome controller={controller} onClose={() => setWelcome(false)} />}
    {printing && <PrintOutput project={project} mode={printMode} paper={controller.preferences.value.paperSize} coordinateFormat={controller.coordinateFormat} />}
  </>;
}

AppShell.displayName = 'AppShell';
