import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { activeWorkspace } from '../workspaces';
import { paneLimits } from '../workspaceLayout';
import { canChangeLayout } from '../editor/commands';
import { FIELD_RESERVE, effectiveViewport, workspaceBreakpoints, type Viewport } from '../editor/breakpoints';
import { useEditorSelector } from '../editor/react';
import type { EditorController } from '../editor/useEditorController';

const PANEL_MIN = 288;

/** The three stages of work. Each is a built-in workspace, so the arrangement is remembered per mode. */
export type ShellMode = 'write' | 'plan' | 'rehearse';
export const SHELL_MODES: readonly { id: ShellMode; label: string; workspace: 'design' | 'production' | 'rehearse'; description: string }[] = [
  { id: 'write', label: 'Write', workspace: 'design', description: 'Shape each set on the field.' },
  { id: 'plan', label: 'Plan', workspace: 'production', description: 'Edit set names, counts, tempo and music in one sheet.' },
  { id: 'rehearse', label: 'Rehearse', workspace: 'rehearse', description: 'Watch the show in 3D and review problems.' },
];

export function shellMode(controller: EditorController): ShellMode {
  if (controller.workspace === 'production') return 'plan';
  return activeWorkspace(controller.preferences.value.workspaces).arrangement.toolbar === 'rehearsal' ? 'rehearse' : 'write';
}

/**
 * Sizes the shell: one side panel beside the field, which docks when the window leaves the field room and
 * otherwise opens over it. The saved layout is only changed by an explicit collapse, show or resize.
 */
export function useShellLayout(controller: EditorController) {
  const studio = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(() => effectiveViewport(window.innerWidth, window.innerHeight, controller.preferences.value.uiScale));
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);

  const layout = controller.preferences.value.workspaceLayout;
  const arrangement = activeWorkspace(controller.preferences.value.workspaces).arrangement;
  const mode = shellMode(controller);
  const dockedEditor = !!(controller.pathOperations || controller.routeEditor || controller.movementEditor);
  const preview = !!(dockedEditor || controller.transformPreview || controller.formationPreview || controller.spacingPreview || controller.coordinatePreview);
  const tab: 'inspector' | 'cast' = controller.castPanelOpen && !preview ? 'cast' : 'inspector';
  const focusMode = useEditorSelector(state => state.ui.focusMode) && mode !== 'plan' && !dockedEditor;
  const locked = !canChangeLayout(controller.store.getState()) || controller.preferences.status === 'loading';

  const measure = () => {
    const node = studio.current;
    if (node) setViewport(current => current.width === node.clientWidth && current.height === node.clientHeight ? current : { width: node.clientWidth, height: node.clientHeight });
  };
  useLayoutEffect(() => {
    const node = studio.current; if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(measure, [controller.preferences.value.uiScale]);

  // The field is height-limited in a landscape window, so the panel can afford a comfortable minimum.
  // One panel, one width: switching tabs never moves the field.
  const [min, max] = [Math.max(PANEL_MIN, paneLimits.inspector[0]), paneLimits.inspector[1]];
  const saved = layout.inspectorWidth;
  const width = Math.round(Math.max(min, Math.min(max, draftWidth ?? saved)));
  // A preview needs its parameters: it shows a panel the writer collapsed for as long as it runs.
  const collapsed = (tab === 'cast' ? layout.castCollapsed : layout.inspectorCollapsed) && !preview;
  const fits = viewport.width - width >= FIELD_RESERVE;
  const available = mode !== 'plan' && !focusMode;
  const docked = available && !collapsed && fits;
  const overlay = available && !docked && (overlayOpen || preview);
  const panelVisible = docked || overlay;
  const mainWidth = viewport.width - (docked ? width : 0);
  const breakpoints = workspaceBreakpoints(viewport, mainWidth);

  // Changing mode, panel tab or workspace ends a panel opened over the field.
  useLayoutEffect(() => { setOverlayOpen(false); }, [mode, focusMode, controller.preferences.value.workspaces.active]);
  // Playback shows the field: starting it closes a panel open over the field.
  useLayoutEffect(() => { if (controller.playing && !preview) setOverlayOpen(false); }, [controller.playing, preview]);

  function showPanel(next: 'inspector' | 'cast' = tab) {
    if (next !== tab) controller.dispatch('cast.show', { mode: next === 'cast' ? 'panel' : 'closed' });
    const key = next === 'cast' ? 'castCollapsed' : 'inspectorCollapsed';
    if (layout[key]) controller.dispatch('layout.update', { update: { [key]: false } });
    if (!fits) setOverlayOpen(true);
  }
  function hidePanel() {
    if (locked && docked) return;
    if (docked) controller.dispatch('layout.update', { update: { [tab === 'cast' ? 'castCollapsed' : 'inspectorCollapsed']: true } });
    setOverlayOpen(false);
  }
  const togglePanel = () => panelVisible ? hidePanel() : showPanel();
  function selectTab(next: 'inspector' | 'cast') {
    if (locked) return;
    controller.dispatch('cast.show', { mode: next === 'cast' ? 'panel' : 'closed' });
    if (next === 'inspector' && layout.inspectorCollapsed) controller.dispatch('layout.update', { update: { inspectorCollapsed: false } });
  }
  function resize(value: number, commit: boolean) {
    const next = Math.round(Math.max(min, Math.min(max, Math.min(value, viewport.width - FIELD_RESERVE))));
    if (!commit) { setDraftWidth(next); return; }
    setDraftWidth(null);
    controller.dispatch('layout.update', { update: { inspectorWidth: next, castWidth: next } });
  }
  const toggleFocus = () => { controller.dispatch('layout.focus'); };

  // Escape leaves focus mode, then closes a panel open over the field. Menus, previews and dialogs take it first.
  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.isComposing) return;
      const state = controller.store.getState();
      if (state.ui.paletteOpen || state.ui.dialog || state.ui.confirmation || state.ui.selectionToolsOpen) return;
      // A lasso being drawn takes Escape first: it cancels the gesture and leaves focus mode and the panel alone.
      if (event.target instanceof Element && event.target.closest('.field-stage__svg')?.querySelector('[data-selection-lasso]')) return;
      if (event.target instanceof Element && event.target.closest('[data-overflow-open], [data-escape-scope], input, textarea, select')) return;
      if (document.querySelector('[data-escape-scope]')) return;
      if (state.ui.transformPreview || state.ui.formationPreview || state.ui.spacingPreview || state.ui.coordinatePreview || state.ui.selectionPreview) return;
      if (overlayOpen && !docked) { event.preventDefault(); event.stopPropagation(); setOverlayOpen(false); return; }
      if (state.ui.focusMode) { event.preventDefault(); event.stopPropagation(); controller.dispatch('layout.focus'); }
    }
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [overlayOpen, docked, controller.store]);

  return {
    studio, viewport, breakpoints, mode, arrangement, tab, preview, dockedEditor, focusMode, locked,
    width, limits: [min, max] as const, docked, overlay, panelVisible, collapsed, fits,
    showPanel, hidePanel, togglePanel, selectTab, resize, toggleFocus, closeOverlay: () => setOverlayOpen(false),
  };
}
export type ShellLayout = ReturnType<typeof useShellLayout>;
