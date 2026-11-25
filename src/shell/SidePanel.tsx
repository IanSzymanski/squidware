import { useRef } from 'react';
import { PanelRightClose } from 'lucide-react';
import { CastWorkspace } from '../editor/CastWorkspace';
import { HelpButton } from '../editor/ControlHelp';
import type { EditorController } from '../editor/useEditorController';
import { uiScale } from '../uiScale';
import { Inspector } from './Inspector';
import type { ShellLayout } from './useShellLayout';

const TABS = [{ id: 'inspector', label: 'Inspector' }, { id: 'cast', label: 'Cast' }] as const;

/** The one side panel: properties of the current work, or the cast list. It docks beside the field or opens over it. */
export function SidePanel({ controller, layout }: { controller: EditorController; layout: ShellLayout }) {
  const drag = useRef<{ pointer: number; startX: number; width: number; current: number } | null>(null);
  const [min, max] = layout.limits;
  const finish = (commit: boolean) => { const state = drag.current; if (!state) return; drag.current = null; layout.resize(commit ? state.current : state.width, true); };
  const hidden = !layout.panelVisible;
  const name = layout.tab === 'cast' ? 'Cast' : 'Inspector';
  return <section id={`workspace-pane-${layout.tab}`} aria-label={`${name} workspace panel`} data-pane={layout.tab} hidden={hidden} inert={hidden}
    className={`side-panel workspace-pane${layout.overlay ? ' workspace-pane--overlay side-panel--overlay' : ''}`} style={{ width: layout.width }}>
    {!layout.overlay && <div className="workspace-resizer side-panel-resizer" role="separator" tabIndex={layout.locked ? -1 : 0} aria-label={`Resize ${name}`} aria-orientation="vertical"
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={layout.width} aria-valuetext={`${layout.width} pixels. Left and right arrows resize.`} aria-controls={`workspace-pane-${layout.tab}`} aria-disabled={layout.locked}
      onKeyDown={event => {
        if (layout.locked || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        layout.resize(event.key === 'Home' ? min : event.key === 'End' ? max : layout.width + (event.key === 'ArrowLeft' ? 1 : -1) * (event.shiftKey ? 40 : 10), true);
      }}
      onPointerDown={event => { if (layout.locked || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { pointer: event.pointerId, startX: event.clientX, width: layout.width, current: layout.width }; }}
      onPointerMove={event => { const state = drag.current; if (state?.pointer !== event.pointerId) return; state.current = state.width - (event.clientX - state.startX) / uiScale(); layout.resize(state.current, false); }}
      onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)} />}
    <div className="side-panel-header workspace-pane-heading">
      <div className="tabs" role="tablist" aria-label="Side panel">
        {TABS.map(tab => <button key={tab.id} role="tab" id={`panel-tab-${tab.id}`} aria-selected={layout.tab === tab.id} aria-controls={`panel-content-${tab.id}`} tabIndex={layout.tab === tab.id ? 0 : -1} disabled={layout.locked && layout.tab !== tab.id}
          onClick={() => layout.selectTab(tab.id)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'inspector' : event.key === 'End' ? 'cast' : tab.id === 'cast' ? 'inspector' : 'cast';
            layout.selectTab(next); requestAnimationFrame(() => document.getElementById(`panel-tab-${next}`)?.focus());
          }}>{tab.label}{tab.id === 'cast' && <span className="badge">{controller.project.performers.length}</span>}</button>)}
      </div>
      {layout.overlay && <HelpButton pointerPassThrough title={`Close ${name}`} description="Close this panel. The panel button in the tool strip brings it back." className="icon-button" onClick={layout.hidePanel}><PanelRightClose size={15} /></HelpButton>}
    </div>
    <div className="side-panel-content workspace-pane-content">
      <div id="panel-content-inspector" role="tabpanel" aria-labelledby="panel-tab-inspector" className="workspace-tab-content" hidden={layout.tab !== 'inspector'} inert={layout.tab !== 'inspector'}><Inspector controller={controller} /></div>
      <div id="panel-content-cast" role="tabpanel" aria-labelledby="panel-tab-cast" className="workspace-tab-content" hidden={layout.tab !== 'cast'} inert={layout.tab !== 'cast'}><CastWorkspace controller={controller} docked /></div>
    </div>
  </section>;
}
