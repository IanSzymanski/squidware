import { uiScale } from '../uiScale';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Columns2, Focus, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw, X } from 'lucide-react';
import { fitWorkspaceLayout, isCrowded, nextCrowdingProbe, paneLimits, paneNames, type CrowdingProbe, type PaneId, type WorkspaceLayout } from '../workspaceLayout';
import { canChangeLayout } from './commands';
import { FIELD_MIN, FIELD_RESERVE, effectiveViewport, fieldReserve, workspaceBreakpoints, type Viewport } from './breakpoints';
import { HelpButton } from './ControlHelp';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import './workspaceLayout.css';

/** Controls folded into Menu or an overflow menu are unmounted; focus returns to whichever trigger is on screen. */
const focusFirst = (...selectors: string[]) => { for (const selector of selectors) { const node = document.querySelector<HTMLElement>(selector); if (node) { node.focus(); return; } } };
const layoutTrigger = ['[aria-label="Workspace layout"]', '[aria-label="Project menu"]'];

export function useWorkspaceLayout(controller: EditorController) {
  const body = useRef<HTMLDivElement>(null);
  const studio = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(() => effectiveViewport(window.innerWidth, window.innerHeight, controller.preferences.value.uiScale).width);
  const [viewport, setViewport] = useState<Viewport>(() => effectiveViewport(window.innerWidth, window.innerHeight, controller.preferences.value.uiScale));
  // The window size and the height the header and status bar leave for the workspace (it settles after startup).
  const [height, setHeight] = useState(0);
  const size = `${viewport.width}x${viewport.height}/${height}`;
  // The pane the writer opened over the field (Show <pane>, or Cast shown from its tab, Dock Cast or the palette). It
  // shows as an overlay only while it does not dock, and stays open until closed or until it docks without demand.
  // `restored` marks a pane the user had collapsed: its overlay offers Collapse rather than Close. `docked` is the size
  // at which Cast docked on demand: only a change at that size opens it over the field, so a resize tucks it.
  const [opened, setOpened] = useState<{ pane: PaneId; restored: boolean; docked?: string } | null>(null);
  const setOverlay = (pane: PaneId | null, restored = false) => setOpened(pane && { pane, restored });
  const focusShow = (pane: PaneId, options?: FocusOptions) => requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-label="Show ${paneNames[pane]}"]`)?.focus(options));
  const [menu, setMenu] = useState(false);
  const layout = controller.preferences.value.workspaceLayout;
  const preview = !!(controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview);
  // A preview shows an Inspector the writer collapsed for as long as it runs; the saved layout and preset stay as chosen.
  const placed = preview && layout.inspectorCollapsed ? { ...layout, inspectorCollapsed: false } : layout;
  const side: 'cast' | 'inspector' = controller.workspace === 'design' && controller.castPanelOpen && !preview ? 'cast' : 'inspector';
  // Cast the writer showed, or the Inspector a preview needs, docks beside a narrower field before it tucks, unless
  // docking would crowd the workspace (nextCrowdingProbe): then it opens over the field instead.
  const [probe, setProbe] = useState<CrowdingProbe | null>(null);
  const crowdingKey = `${size}:${side}:${controller.view}:${controller.workspace}`;
  const demanded = (side === 'cast' || preview) && !isCrowded(probe, crowdingKey);
  const fit = fitWorkspaceLayout(placed, available, side, demanded);
  // Without demand: a writer's pane that docks this way no longer needs its overlay.
  const idle = fitWorkspaceLayout(placed, available, side);
  const focusMode = useEditorSelector(state => state.ui.focusMode) && controller.workspace === 'design';
  // Focus mode hides every panel, so nothing opens over the field there: no overlay, scrim or preview margin. A
  // preview's Inspector is over the field wherever it does not dock, ahead of any other pane so Apply and Cancel stay
  // reachable; that placement is derived, so it ends with the preview.
  const writer = opened && (!opened.docked || opened.docked === size) ? opened : null;
  const overlay = focusMode ? null : preview && fit.sideHidden ? 'inspector' : writer && (writer.pane === 'sets' ? fit.setsHidden : writer.pane === side && fit.sideHidden) ? writer.pane : null;
  const restored = opened?.restored ? opened.pane : null;
  // The timeline spans the main workspace: the width left beside docked (or tucked) panels.
  const mainWidth = focusMode ? available : available - (fit.setsHidden ? 30 : fit.widths.sets + 6) - (fit.sideHidden ? 30 : fit.widths[side] + 6);
  const breakpoints = workspaceBreakpoints(viewport, mainWidth);
  // A pane open over the field covers its edge of the main workspace; during a preview the field fits beside it.
  const overlayWidth = overlay ? Math.min(fit.widths[overlay], Math.max(paneLimits[overlay][0], available - 60)) : 0;
  const studioStyle = { '--field-min-width': `${FIELD_MIN.width}px`, '--field-min-height': `${FIELD_MIN.height}px`, '--field-reserve': `${fieldReserve(demanded)}px`, '--overlay-width': `${overlayWidth}px` } as CSSProperties;
  const locked = !canChangeLayout(controller.store.getState()) || controller.preferences.status === 'loading';
  const reason = 'Finish or cancel the current input, preview or gesture before changing the layout.';
  // .studio fills the effective viewport (--viewport-width × --viewport-height), so CSS zoom from the UI scale and
  // browser zoom are both already divided out of its client size.
  const measure = () => {
    const node = body.current, root = studio.current;
    if (node) { setAvailable(node.clientWidth); setHeight(node.offsetHeight); }
    if (root) setViewport(current => current.width === root.clientWidth && current.height === root.clientHeight ? current : { width: root.clientWidth, height: root.clientHeight });
    // Cast that holds focus opens over the field when a resize leaves it no room to dock; Cast the writer showed
    // otherwise tucks there (`docked`). Focus left in Cast once it is hidden (closed with Escape) does not count.
    setOpened(current => document.querySelector('#workspace-pane-cast:not([hidden])')?.contains(document.activeElement) ? { pane: 'cast', restored: current?.pane === 'cast' && current.restored } : current);
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    for (const node of [body.current, studio.current]) if (node) observer.observe(node);
    measure(); return () => observer.disconnect();
  }, []);
  // A UI scale change re-measures in the same commit (its CSS zoom is applied by an earlier layout effect), so the
  // header and panels never paint one frame at the previous scale's breakpoints.
  const uiScale = controller.preferences.value.uiScale;
  useLayoutEffect(measure, [uiScale]);
  // A pane that fits again without a preview's demand docks: its overlay ends and the saved layout shows as chosen.
  // These run as layout effects, in this order, so an overlay is on screen before the next paint or animation frame.
  useLayoutEffect(() => { if (opened && (opened.pane === 'sets' ? !idle.setsHidden : opened.pane === side && !idle.sideHidden)) setOverlay(null); }, [opened, idle.setsHidden, idle.sideHidden, side]);
  const findPerformer = useRef(false);
  // A preview borrows the side panel for the Inspector: the panels the writer opened are back when it ends.
  useLayoutEffect(() => { setOverlay(null); setMenu(false); findPerformer.current = false; }, [focusMode, controller.workspace, controller.castPanelOpen]);
  // Showing Cast (header tab, Dock Cast, palette) opens it for the writer in place of any other pane over the field:
  // it docks, or opens over the field where it does not fit or would crowd the workspace. Focus then moves to its
  // search as soon as it is on screen. A Cast the writer had collapsed offers Collapse, as from Show Cast.
  const castReveal = useEditorSelector(state => state.ui.castReveal);
  useLayoutEffect(() => { if (!castReveal || side !== 'cast' || focusMode) return; findPerformer.current = true; setOverlay('cast', controller.store.getState().ui.castRevealRestored); }, [castReveal]);
  useLayoutEffect(() => {
    const search = findPerformer.current && document.querySelector<HTMLElement>('#workspace-pane-cast [aria-label="Find a performer"]');
    if (search && !search.closest('[hidden], [inert]')) { findPerformer.current = false; search.focus(); }
  });
  // Measured where the demand decides whether the panel docks: after every render, and whenever the workspace content
  // changes size, since a 3D view or the timeline can grow after the render that docked the panel. `need` is how far
  // the content overflows once the field is at its floor (negative: room to spare). Cast that holds focus opens over
  // the field when it becomes crowded, rather than tucking away with focus inside it. The same measurement gives the
  // transport row's height, above which a panel open over the field during a preview ends.
  const docksOnDemand = (side === 'cast' || preview) && !focusMode && !fitWorkspaceLayout(placed, available, side, true).sideHidden && idle.sideHidden;
  const crowding = useRef(() => {});
  const placedAt = useRef<string | null>(null);
  useLayoutEffect(() => {
    crowding.current = () => {
      const node = body.current; if (!node) return;
      if (preview && overlay) node.style.setProperty('--transport-height', `${node.querySelector<HTMLElement>('.main-workspace > .timeline > .transport')?.offsetHeight ?? 0}px`);
      // During a preview a control focused in a panel stays in view when the Inspector moves over the field or docks
      // again, or the panel's height changes with the window or the transport row: the first preview in a newly measured
      // situation docks the Inspector for one commit (while the panel focuses its control) before crowding moves it.
      const place = preview ? `${overlay}:${overlay ? node.style.getPropertyValue('--transport-height') : ''}:${node.clientHeight}` : null;
      if (place !== placedAt.current) { placedAt.current = place; const active = document.activeElement; if (place && active?.closest('.workspace-pane')) active.scrollIntoView({ block: 'nearest' }); }
      // A measurement belongs to the situation rendered: during a resize the observers report the new size before its
      // render, and measuring then would decide for the previous size.
      const root = studio.current;
      if (!docksOnDemand || root?.clientWidth !== viewport.width || root.clientHeight !== viewport.height || node.offsetHeight !== height) return;
      const field = node.querySelector<HTMLElement>('.main-workspace > .field-container');
      const need = node.scrollHeight - node.clientHeight - (field ? field.offsetHeight - (parseFloat(getComputedStyle(field).minHeight) || 0) : 0);
      const next = nextCrowdingProbe(probe, crowdingKey, demanded, need);
      // Cast the writer showed that docks here opens over the field if a later change in this situation crowds it.
      if (next === probe) { if (demanded && side === 'cast' && opened?.pane === 'cast' && opened.docked !== size) setOpened({ ...opened, docked: size }); return; }
      setProbe(next);
      if (side === 'cast' && isCrowded(next, crowdingKey) && document.querySelector('#workspace-pane-cast:not([hidden])')?.contains(document.activeElement)) setOpened(current => current?.pane === 'cast' ? current : { pane: 'cast', restored: false });
    };
    crowding.current();
  });
  useLayoutEffect(() => {
    const main = body.current?.querySelector('.main-workspace'); if (!main) return;
    const observer = new ResizeObserver(() => crowding.current());
    for (const node of [main, ...main.children]) observer.observe(node);
    return () => observer.disconnect();
  }, [controller.workspace]);
  // When a preview starts or ends, a pane opens over the field or playback closes one, focus moves only where the
  // writer lost it: held in the workspace as this update renders (EditorTimeline notes it the same way) on a control the
  // commit removed or hid, such as a preview's Apply or Cancel or a pane that tucks, or left under the scrim. In the same
  // commit it moves to the heading of the pane open over the scrim, else to the Inspector's Selection actions, else to
  // the field area: Space plays and pauses from both, and Tab continues with Clear selection or into the field. Focus
  // elsewhere, including on the page, stays. (Closing a pane returns focus to its Show button.)
  const held = useRef<Element | null>(null);
  held.current = body.current?.contains(document.activeElement) ? document.activeElement : null;
  const playing = useEditorSelector(state => state.playback.playing);
  const rescueFocus = () => {
    const active = document.activeElement, was = held.current, pane = overlay && !preview && !playing && document.getElementById(`workspace-pane-${overlay}`);
    const lost = !!active?.closest('[hidden], [inert]') || active === document.body && !!was && (!was.isConnected || !!was.closest('[hidden], [inert]'));
    const covered = !!pane && !!active && active !== document.body && !!body.current?.contains(active) && !pane.contains(active);
    if (focusMode || !lost && !covered) return;
    if (pane) focusFirst(`#workspace-pane-${overlay} .workspace-pane-heading button`);
    else focusFirst('#workspace-pane-inspector:not([hidden]) .selection-bar', '.main-workspace > .field-container');
  };
  const previewed = useRef(preview);
  useLayoutEffect(() => { if (previewed.current !== preview) { previewed.current = preview; rescueFocus(); } }, [preview]);
  // Playback shows the field: starting it closes a pane open over the field, also one a preview it ends gives back, so
  // no scrim hides the show and Space on Pause still pauses.
  useLayoutEffect(() => { if (playing && overlay && !preview) setOverlay(null); }, [playing, preview]);
  useLayoutEffect(() => { if (overlay || playing) rescueFocus(); }, [overlay]);
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing || controller.store.getState().ui.paletteOpen || controller.store.getState().ui.dialog || controller.store.getState().ui.selectionToolsOpen) return;
      if (event.target instanceof Element && event.target.closest('.field-stage__svg')?.querySelector('[data-selection-lasso]')) return;
      // An open overflow menu closes first and returns focus to its trigger, also during a preview.
      if (event.target instanceof Element && event.target.closest('[data-overflow-open], [data-escape-scope]')) return;
      if (overlay && !menu && !canChangeLayout(controller.store.getState())) {
        const s = controller.store.getState();
        const input = event.target instanceof HTMLElement && (event.target.matches('input, textarea, select') || event.target.isContentEditable);
        const cancel = s.ui.transformPreview ? 'transform.cancel' : s.ui.formationPreview ? 'formation.cancel' : s.ui.spacingPreview ? 'spacing.cancel' : s.ui.coordinatePreview ? 'coordinates.cancel' : null;
        if (cancel && !input && !s.ui.pendingDraft) { event.preventDefault(); event.stopPropagation(); controller.dispatch(cancel); }
        return;
      }
      if (menu || overlay || controller.store.getState().ui.focusMode) {
        event.preventDefault(); event.stopPropagation();
        if (menu) { setMenu(false); requestAnimationFrame(() => focusFirst(...layoutTrigger)); }
        else if (overlay) { setOverlay(null); focusShow(overlay); }
        else { controller.dispatch('layout.focus'); requestAnimationFrame(() => focusFirst('[aria-label="Focus field"]', '[aria-label="Project menu"]')); }
      }
    }
    window.addEventListener('keydown', escape, true); return () => window.removeEventListener('keydown', escape, true);
  }, [menu, overlay, controller.store]);
  /** Collapsing a pane, for example from the layout options, also closes it when the writer had opened it. */
  function update(update: Partial<WorkspaceLayout>) { if (controller.dispatch('layout.update', { update }) === true && opened && update[`${opened.pane}Collapsed`]) setOverlay(null); }
  /** A pointer click (on Close, Collapse or Show, or on the field around an overlay) moves focus without the keyboard
   * focus style and its help, which a click does not call for; Enter, Space and Escape keep them. */
  const clicked = (pointer: boolean) => pointer ? { focusVisible: false } as FocusOptions : undefined;
  function collapse(pane: PaneId, pointer = false) {
    if (locked) return;
    // Closing a pane the window tucked only ends its overlay; the saved layout and preset stay as chosen. A pane the
    // user had collapsed, restored by Show or the Cast tab, collapses again.
    if (overlay !== pane || layout[`${pane}Collapsed`] || restored === pane) update({ [`${pane}Collapsed`]: true });
    setOverlay(null); focusShow(pane, clicked(pointer));
  }
  /** A click on the field around an overlay closes it like Escape and returns focus to the pane's Show button. */
  function dismiss() { if (!overlay || locked) return; setOverlay(null); focusShow(overlay, clicked(true)); }
  function reveal(pane: PaneId, pointer = false) {
    if (controller.preferences.status === 'loading') return;
    const currentPreview = controller.store.getState().ui;
    const previewWasActive = !!(currentPreview.transformPreview || currentPreview.formationPreview || currentPreview.spacingPreview || currentPreview.coordinatePreview || currentPreview.selectionPreview);
    const collapsed = layout[`${pane}Collapsed`];
    // Only a pane the user collapsed changes the saved layout; a pane tucked away by a small window opens over the
    // field (where it docks once restored, the overlay ends at once).
    if (collapsed) update({ [`${pane}Collapsed`]: false });
    setOverlay(pane, collapsed);
    requestAnimationFrame(() => {
      // A preview started while the pane was opening owns focus. Do not let
      // this earlier reveal callback replace its parameter control's focus.
      const next = controller.store.getState().ui;
      if (!previewWasActive && (next.transformPreview || next.formationPreview || next.spacingPreview || next.coordinatePreview || next.selectionPreview)) return;
      document.querySelector<HTMLElement>(`#workspace-pane-${pane} button`)?.focus(clicked(pointer));
    });
  }
  function toggleFocus() {
    if (controller.dispatch('layout.focus')) requestAnimationFrame(() => focusMode ? focusFirst('[aria-label="Focus field"]', '[aria-label="Project menu"]') : focusFirst('[aria-label="Exit focus"]'));
  }
  /** Opens layout options from Menu when the header has folded the Layout button away. */
  function openFromMenu() {
    controller.setMenu(false); setMenu(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#workspace-layout-options button')?.focus());
  }
  return { body, studio, studioStyle, available, viewport, breakpoints, overlay, overlayWidth, setOverlay, restored, menu, setMenu, layout, side, preview, fit, focusMode, locked, reason, update, collapse, dismiss, reveal, toggleFocus, openFromMenu };
}
export type WorkspaceLayoutController = ReturnType<typeof useWorkspaceLayout>;
const presetName = (preset: WorkspaceLayout['preset']) => preset[0].toUpperCase() + preset.slice(1);

/** In a compact header only the options popover renders here, anchored to Menu, which then holds Layout and Focus field. */
export function LayoutControls({ controller, layout: l, compact = false }: { controller: EditorController; layout: WorkspaceLayoutController; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const anchor = (compact ? root.current?.parentElement?.querySelector('.file-menu') : root.current)?.getBoundingClientRect();
  const close = () => { l.setMenu(false); if (compact) focusFirst('[aria-label="Project menu"]'); else root.current?.querySelector('button')?.focus(); };
  useEffect(() => { l.setMenu(false); }, [l.available]);
  useEffect(() => {
    if (!l.menu) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) l.setMenu(false); };
    const focus = (event: FocusEvent) => { if (!root.current?.contains(event.target as Node)) l.setMenu(false); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin', focus); };
  }, [l.menu]);
  return <div className="workspace-layout-controls" ref={root}>
    {!compact && <><HelpButton pointerPassThrough title="Workspace layout" description="Choose Write, Review or Rehearse, resize panels, and restore hidden tools." state={presetName(l.layout.preset)} className="button subtle" aria-expanded={l.menu} aria-controls="workspace-layout-options" onClick={() => l.setMenu(!l.menu)}><Columns2 size={16} />Layout</HelpButton>
    <FocusFieldButton controller={controller} layout={l} className="icon-button"><Focus size={17} /></FocusFieldButton></>}
    {l.menu && <div id="workspace-layout-options" className="layout-popover" role="region" aria-label="Layout options" style={{ top: (anchor?.bottom ?? 48) / uiScale() + 6, left: Math.max(12, Math.min((anchor?.left ?? 12) / uiScale(), window.innerWidth / uiScale() - 402)), maxHeight: Math.max(120, (window.innerHeight - (anchor?.bottom ?? 48)) / uiScale() - 18) }}>
      <div className="layout-popover-heading"><strong>Workspace layout</strong><button aria-label="Close layout options" onClick={close}><X size={16} /></button></div>
      <div className="layout-presets" role="group" aria-label="Layout presets">{(['write', 'review', 'rehearse'] as const).map(preset => <HelpButton pointerPassThrough key={preset} title={`${presetName(preset)} preset`} command="layout.preset" className="button subtle" aria-pressed={l.layout.preset === preset} disabled={l.locked} disabledReason={l.reason} onClick={() => { controller.dispatch('layout.preset', { preset }); l.setOverlay(null); }}>{l.layout.preset === preset && <Check size={14} aria-hidden="true" />}{presetName(preset)}</HelpButton>)}</div>
      {l.layout.preset === 'custom' && <p className="layout-custom" role="status">Custom layout: choose a preset to restore its panels and widths.</p>}
      <p>Write: editing tools · Review: wider field · Rehearse: field and playback.</p>
      {(['sets', 'inspector', 'cast'] as const).map(pane => <div className="layout-pane-option" key={pane}>
        <label><input type="checkbox" disabled={l.locked} checked={!l.layout[`${pane}Collapsed`]} onChange={e => l.update({ [`${pane}Collapsed`]: !e.target.checked })} />{paneNames[pane]}</label>
        <label>Width <input aria-label={`${paneNames[pane]} width`} type="range" min={paneLimits[pane][0]} max={paneLimits[pane][1]} step={1} value={l.layout[`${pane}Width`]} disabled={l.locked} onChange={e => l.update({ [`${pane}Width`]: Number(e.target.value) })} /><output>{l.layout[`${pane}Width`]} px</output></label>
      </div>)}
      <p>Cast uses the right panel when opened. Narrow windows and large UI scales temporarily tuck panels away, the set list first, without changing these choices; use their Show buttons to open them over the field.</p>
      <HelpButton pointerPassThrough title="Reset workspace layout" description="Restore Write, default panel widths and the Inspector. Other preferences stay as chosen." className="button subtle" disabled={l.locked} disabledReason={l.reason} onClick={() => { controller.dispatch('layout.preset', { preset: 'write' }); l.setOverlay(null); }}><RotateCcw size={14} />Reset layout</HelpButton>
      {l.locked && <p role="status">{l.reason}</p>}
    </div>}
  </div>;
}

export function FocusFieldButton({ controller, layout: l, className, children }: { controller: EditorController; layout: WorkspaceLayoutController; className?: string; children: ReactNode }) {
  return <HelpButton pointerPassThrough command="layout.focus" title="Focus field" className={className} disabled={controller.workspace !== 'design' || l.locked} disabledReason={l.reason} onClick={l.toggleFocus}>{children}</HelpButton>;
}

export function WorkspacePane({ pane, layout: l, children }: { pane: PaneId; layout: WorkspaceLayoutController; children: ReactNode }) {
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; startX: number; width: number; current: number } | null>(null);
  const hidden = pane === 'sets' ? l.fit.setsHidden : l.fit.sideHidden;
  const overlay = l.overlay === pane; const tucked = hidden && !l.layout[`${pane}Collapsed`] && l.restored !== pane;
  // While a preview's Inspector is over the field, nothing replaces it there.
  const blocked = l.preview && !!l.overlay && !overlay;
  const left = pane === 'sets'; const [min, max] = paneLimits[pane];
  const width = draftWidth ?? l.fit.widths[pane];
  const otherWidth = left ? l.fit.sideHidden ? 30 : l.fit.widths[l.side] + 6 : l.fit.setsHidden ? 30 : l.fit.widths.sets + 6;
  const dragMax = Math.max(min, Math.min(max, l.available - otherWidth - FIELD_RESERVE - 6));
  const resize = (value: number) => l.update({ [`${pane}Width`]: Math.round(Math.max(min, Math.min(max, value))) });
  const finish = (commit: boolean) => { if (!drag.current) return; if (commit) resize(drag.current.current); drag.current = null; setDraftWidth(null); };
  return <>
    {hidden && <div className="workspace-pane-closed" data-tucked={tucked || undefined}><HelpButton pointerPassThrough title={`Show ${paneNames[pane]}`} description={l.layout[`${pane}Collapsed`] ? `Restore ${paneNames[pane]}. On a small window it opens over the field.` : `This window is too small to dock ${paneNames[pane]} beside the field; it opens over the field. Your layout returns when the window grows.`} disabled={blocked} disabledReason="Apply or cancel the preview first: its Inspector is open over the field." aria-expanded={overlay} aria-controls={`workspace-pane-${pane}`} onClick={e => l.reveal(pane, e.detail > 0)}>{left ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}<span>{paneNames[pane]}</span></HelpButton></div>}
    <section id={`workspace-pane-${pane}`} aria-label={`${paneNames[pane]} workspace panel`} data-pane={pane} className={`workspace-pane${overlay ? ' workspace-pane--overlay' : ''}${left ? ' workspace-pane--left' : ' workspace-pane--right'}`} hidden={hidden && !overlay} inert={hidden && !overlay} style={{ '--pane-width': `${overlay ? l.overlayWidth : width}px` } as CSSProperties}>
      <div className="workspace-pane-heading"><strong>{paneNames[pane]}</strong><HelpButton pointerPassThrough title={`${overlay && tucked ? 'Close' : 'Collapse'} ${paneNames[pane]}`} description={overlay && tucked ? `Close this overlay. Your layout is unchanged: ${paneNames[pane]} docks again when the window is wide enough.` : `Hide ${paneNames[pane]} and keep a Show button available.`} className="icon-button" disabled={l.locked} disabledReason={l.reason} onClick={e => l.collapse(pane, e.detail > 0)}>{left ? <PanelLeftClose size={16} /> : <PanelRightClose size={16} />}</HelpButton></div>
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
        onPointerMove={e => { const start = drag.current; if (start?.pointer === e.pointerId) { start.current = Math.round(Math.max(min, Math.min(dragMax, start.width + (e.clientX - start.startX) / uiScale() * (left ? 1 : -1)))); setDraftWidth(start.current); } }}
        onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)} onBlur={() => finish(false)} />}
    </section>
  </>;
}
