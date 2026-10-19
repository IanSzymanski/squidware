import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Columns2, Focus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw, X } from 'lucide-react';
import { fitWorkspaceLayout, paneLimits, paneNames, type PaneId, type WorkspaceLayout } from '../workspaceLayout';
import { canChangeLayout } from './commands';
import { HelpButton } from './ControlHelp';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import './workspaceLayout.css';

export function useWorkspaceLayout(controller: EditorController) {
  const body = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(window.innerWidth);
  const [overlay, setOverlay] = useState<PaneId | null>(null);
  const [menu, setMenu] = useState(false);
  const layout = controller.preferences.value.workspaceLayout;
  const preview = !!(controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview);
  const side: 'cast' | 'inspector' = controller.workspace === 'design' && controller.castPanelOpen && !preview ? 'cast' : 'inspector';
  const fit = fitWorkspaceLayout(layout, available, side);
  const focusMode = useEditorSelector(state => state.ui.focusMode) && controller.workspace === 'design';
  const locked = !canChangeLayout(controller.store.getState()) || controller.preferences.status === 'loading';
  const reason = 'Finish or cancel the current input, preview or gesture before changing the layout.';
  useLayoutEffect(() => {
    const node = body.current; if (!node) return;
    const observer = new ResizeObserver(() => setAvailable(node.clientWidth)); observer.observe(node);
    setAvailable(node.clientWidth); return () => observer.disconnect();
  }, []);
  useEffect(() => { setOverlay(null); setMenu(false); }, [focusMode, controller.workspace, side]);
  useEffect(() => {
    if (!preview) return;
    controller.dispatch('layout.update', { update: { inspectorCollapsed: false } });
    if (fitWorkspaceLayout({ ...layout, inspectorCollapsed: false }, available, 'inspector').sideHidden) setOverlay('inspector');
  }, [preview]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing || controller.store.getState().ui.dialog) return;
      if (overlay && !menu && !canChangeLayout(controller.store.getState())) {
        const s = controller.store.getState();
        const input = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
        const cancel = s.ui.transformPreview ? 'transform.cancel' : s.ui.formationPreview ? 'formation.cancel' : s.ui.spacingPreview ? 'spacing.cancel' : s.ui.coordinatePreview ? 'coordinates.cancel' : null;
        if (cancel && !input && !s.ui.pendingDraft) { event.preventDefault(); event.stopPropagation(); controller.dispatch(cancel); }
        return;
      }
      if (menu || overlay || controller.store.getState().ui.focusMode) {
        event.preventDefault(); event.stopPropagation();
        if (menu) { setMenu(false); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Workspace layout"]')?.focus()); }
        else if (overlay) { const pane = overlay; setOverlay(null); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="Show ${paneNames[pane]}"]`)?.focus()); }
        else { controller.dispatch('layout.focus'); requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="Focus field"]')?.focus()); }
      }
    }
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [menu, overlay, controller.store]);
  function update(update: Partial<WorkspaceLayout>) { controller.dispatch('layout.update', { update }); }
  function collapse(pane: PaneId) {
    if (locked) return;
    update({ [`${pane}Collapsed`]: true }); setOverlay(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="Show ${paneNames[pane]}"]`)?.focus());
  }
  function reveal(pane: PaneId) {
    if (controller.preferences.status === 'loading') return;
    const next = { ...layout, [`${pane}Collapsed`]: false };
    update({ [`${pane}Collapsed`]: false });
    const resolved = fitWorkspaceLayout(next, available, side);
    setOverlay(pane === 'sets' ? resolved.setsHidden ? pane : null : resolved.sideHidden ? pane : null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`#workspace-pane-${pane} button`)?.focus());
  }
  function toggleFocus() {
    if (controller.dispatch('layout.focus')) requestAnimationFrame(() => document.querySelector<HTMLElement>(focusMode ? '[aria-label="Focus field"]' : '[aria-label="Exit focus"]')?.focus());
  }
  return { body, available, overlay, setOverlay, menu, setMenu, layout, side, fit, focusMode, locked, reason, update, collapse, reveal, toggleFocus };
}
export type WorkspaceLayoutController = ReturnType<typeof useWorkspaceLayout>;

export function LayoutControls({ controller, layout: l }: { controller: EditorController; layout: WorkspaceLayoutController }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { l.setMenu(false); }, [l.available]);
  useEffect(() => {
    if (!l.menu) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) l.setMenu(false); };
    const focus = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) l.setMenu(false); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', focus); };
  }, [l.menu]);
  return <div className="workspace-layout-controls" ref={root}>
    <HelpButton pointerPassThrough title="Workspace layout" description="Choose Write, Review or Rehearse, resize panels, and restore hidden tools." className="button subtle" aria-expanded={l.menu} aria-controls="workspace-layout-options" onClick={() => l.setMenu(!l.menu)}><Columns2 size={16} />Layout</HelpButton>
    <HelpButton pointerPassThrough command="layout.focus" title="Focus field" className="icon-button" disabled={controller.workspace !== 'design' || l.locked} disabledReason={l.reason} onClick={l.toggleFocus}><Focus size={17} /></HelpButton>
    {l.menu && <div id="workspace-layout-options" className="layout-popover" role="region" aria-label="Layout options" style={{ top: (root.current?.getBoundingClientRect().bottom ?? 48) + 6, left: Math.max(12, Math.min(root.current?.getBoundingClientRect().left ?? 12, window.innerWidth - 402)), maxHeight: Math.max(120, window.innerHeight - (root.current?.getBoundingClientRect().bottom ?? 48) - 18) }}>
      <div className="layout-popover-heading"><strong>Workspace layout</strong><button aria-label="Close layout options" onClick={() => { l.setMenu(false); root.current?.querySelector('button')?.focus(); }}><X size={16} /></button></div>
      <div className="layout-presets">{(['write', 'review', 'rehearse'] as const).map(preset => <HelpButton pointerPassThrough key={preset} title={`${preset[0].toUpperCase() + preset.slice(1)} preset`} command="layout.preset" className="button subtle" aria-pressed={l.layout.preset === preset} disabled={l.locked} disabledReason={l.reason} onClick={() => { controller.dispatch('layout.preset', { preset }); l.setOverlay(null); }}>{preset[0].toUpperCase() + preset.slice(1)}</HelpButton>)}</div>
      <p>Write: editing tools · Review: wider field · Rehearse: field and playback.</p>
      {(['sets', 'inspector', 'cast'] as const).map(pane => <div className="layout-pane-option" key={pane}>
        <label><input type="checkbox" disabled={l.locked} checked={!l.layout[`${pane}Collapsed`]} onChange={e => l.update({ [`${pane}Collapsed`]: !e.target.checked })} />{paneNames[pane]}</label>
        <label>Width <input aria-label={`${paneNames[pane]} width`} type="range" min={paneLimits[pane][0]} max={paneLimits[pane][1]} step={1} value={l.layout[`${pane}Width`]} disabled={l.locked} onChange={e => l.update({ [`${pane}Width`]: Number(e.target.value) })} /><output>{l.layout[`${pane}Width`]} px</output></label>
      </div>)}
      <p>Cast uses the right panel when opened. Narrow windows temporarily tuck panels away; use their Show buttons to open them over the field.</p>
      <HelpButton pointerPassThrough title="Reset workspace layout" description="Restore Write, default panel widths and the Inspector. Other preferences stay as chosen." className="button subtle" disabled={l.locked} disabledReason={l.reason} onClick={() => { controller.dispatch('layout.preset', { preset: 'write' }); l.setOverlay(null); }}><RotateCcw size={14} />Reset layout</HelpButton>
      {l.locked && <p role="status">{l.reason}</p>}
    </div>}
  </div>;
}

export function WorkspacePane({ pane, layout: l, children }: { pane: PaneId; layout: WorkspaceLayoutController; children: ReactNode }) {
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; startX: number; width: number; current: number } | null>(null);
  const hidden = pane === 'sets' ? l.fit.setsHidden : l.fit.sideHidden;
  const overlay = l.overlay === pane;
  const left = pane === 'sets'; const [min, max] = paneLimits[pane];
  const width = draftWidth ?? l.fit.widths[pane];
  const otherWidth = left ? l.fit.sideHidden ? 30 : l.fit.widths[l.side] + 6 : l.fit.setsHidden ? 30 : l.fit.widths.sets + 6;
  const dragMax = Math.max(min, Math.min(max, l.available - otherWidth - 366));
  const resize = (value: number) => l.update({ [`${pane}Width`]: Math.round(Math.max(min, Math.min(max, value))) });
  const finish = (commit: boolean) => { if (!drag.current) return; if (commit) resize(drag.current.current); drag.current = null; setDraftWidth(null); };
  return <>
    {hidden && <div className="workspace-pane-closed"><HelpButton pointerPassThrough title={`Show ${paneNames[pane]}`} description={`Restore ${paneNames[pane]}. On a narrow window it opens over the field.`} aria-expanded={overlay} aria-controls={`workspace-pane-${pane}`} onClick={() => l.reveal(pane)}>{left ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}<span>{paneNames[pane]}</span></HelpButton></div>}
    <section id={`workspace-pane-${pane}`} aria-label={`${paneNames[pane]} workspace panel`} data-pane={pane} className={`workspace-pane${overlay ? ' workspace-pane--overlay' : ''}${left ? ' workspace-pane--left' : ' workspace-pane--right'}`} hidden={hidden && !overlay} inert={hidden && !overlay} style={{ '--pane-width': `${overlay ? Math.min(width, Math.max(min, l.available - 60)) : width}px` } as CSSProperties}>
      <div className="workspace-pane-heading"><strong>{paneNames[pane]}</strong><HelpButton pointerPassThrough title={`Collapse ${paneNames[pane]}`} description={`Hide ${paneNames[pane]} and keep a Show button available.`} className="icon-button" disabled={l.locked} disabledReason={l.reason} onClick={() => l.collapse(pane)}>{left ? <PanelLeftClose size={16} /> : <PanelRightClose size={16} />}</HelpButton></div>
      <div className="workspace-pane-content">{children}</div>
      {!overlay && <div className="workspace-resizer" role="separator" tabIndex={l.locked ? -1 : 0} aria-label={`Resize ${paneNames[pane]}`} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(width)} aria-valuetext={`${Math.round(width)} pixels. Left and right arrows resize; Home and End use limits; Enter collapses.`} aria-controls={`workspace-pane-${pane}`} aria-disabled={l.locked}
        onKeyDown={e => {
          if (l.locked) return;
          if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopPropagation(); finish(false); return; }
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); l.collapse(pane); return; }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation(); resize(e.key === 'Home' ? min : e.key === 'End' ? max : width + (e.key === 'ArrowRight' ? 1 : -1) * (left ? 1 : -1) * (e.shiftKey ? 40 : 10));
        }}
        onPointerDown={e => { if (l.locked || e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { pointer: e.pointerId, startX: e.clientX, width, current: width }; setDraftWidth(width); }}
        onPointerMove={e => { const start = drag.current; if (start?.pointer === e.pointerId) { start.current = Math.round(Math.max(min, Math.min(dragMax, start.width + (e.clientX - start.startX) * (left ? 1 : -1)))); setDraftWidth(start.current); } }}
        onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)} onBlur={() => finish(false)} />}
    </section>
  </>;
}
