import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Box, SquareArrowOutUpRight } from 'lucide-react';
import type { Stage3DQuality } from '../components/Stage3D';
import { HelpButton } from './ControlHelp';
import { Button } from './EditorControls';
import { Mirrored3D } from './Mirrored3D';
import { addFrameSource } from './frameSources';
import { useFieldScene } from './mirroredScene';
import { useEditorSelector } from './react';
import { formatTransportCount } from './timelineNavigation';
import type { EditorController } from './useEditorController';
import './popout3d.css';

/** Main allows exactly this about:blank frame name; every other window request is denied. */
export const POPOUT_FRAME = 'squidware-3d-preview';
/** A closed window can hold main's single slot this long (usually under 0.2 s; slow teardowns approach 1 s). */
const CLOSING_MS = 2000;
const stylesheets = 'link[rel~="stylesheet"], style';

/** Give the empty same-origin window the app's CSP and styles, following later additions (lazy chunks, Vite). */
function prepareWindow(child: Window) {
  const doc = child.document;
  doc.head.replaceChildren(); doc.body.replaceChildren();
  doc.documentElement.lang = 'en';
  // The window already inherits the editor's policy; repeating it keeps the rule visible in its own head.
  const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (policy) doc.head.append(doc.importNode(policy, true));
  doc.body.className = 'popout-3d-body';
  const copies = new Map<Element, Element>();
  const sync = () => {
    const sources = [...document.head.querySelectorAll(stylesheets)];
    for (const [source, copy] of copies) if (!sources.includes(source)) { copy.remove(); copies.delete(source); }
    for (const source of sources) {
      let copy = copies.get(source);
      if (source instanceof HTMLLinkElement) {
        if (!copy) { copy = doc.createElement('link'); (copy as HTMLLinkElement).rel = 'stylesheet'; }
        if ((copy as HTMLLinkElement).href !== source.href) (copy as HTMLLinkElement).href = source.href;
      } else {
        copy ??= doc.createElement('style');
        if (copy.textContent !== source.textContent) copy.textContent = source.textContent;
      }
      if (!copies.has(source)) { copies.set(source, copy); doc.head.append(copy); }
    }
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'rel'] });
  return () => observer.disconnect();
}

/** Owns the separate 3D window: opens it on demand, renders the mirrored scene into it and reports closing. */
export function Popout3D({ controller }: { controller: EditorController }) {
  const { store } = controller;
  const popout = useEditorSelector(state => state.ui.popout3d);
  const focus = useEditorSelector(state => state.ui.popout3dFocus);
  const { theme, uiScale } = controller.preferences.value;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const update = useRef(controller.preferences.update); update.current = controller.preferences.update;
  const retained = useRef<{ child: Window; timer: number } | null>(null);
  const closedAt = useRef(-Infinity); const [attempt, setAttempt] = useState(0);
  // Desktop only: the browser build keeps the feature hidden.
  useEffect(() => { if (typeof window.squidware?.focusPreviewWindow === 'function' && store.getState().ui.popout3d === 'unavailable') store.setValue('ui', 'popout3d', 'closed'); }, [store]);
  useEffect(() => window.squidware?.onPreviewWindowBounds?.(bounds => update.current({ popout3dBounds: bounds })), []);
  useEffect(() => { if (focus) window.squidware?.focusPreviewWindow(); }, [focus]);
  useEffect(() => {
    if (popout !== 'open') return;
    // A development StrictMode remount reuses the window rather than flashing a new one.
    const kept = retained.current; retained.current = null;
    if (kept) clearTimeout(kept.timer);
    const child = kept && !kept.child.closed ? kept.child : window.open('', POPOUT_FRAME, 'popup');
    if (!child) {
      // Main keeps its single window slot until a closing 3D window is gone; reopening right after a close waits for it.
      if (performance.now() - closedAt.current < CLOSING_MS) { const retry = window.setTimeout(() => setAttempt(value => value + 1), 50); return () => clearTimeout(retry); }
      store.setValue('ui', 'popout3d', 'closed'); store.setValue('ui', 'toast', 'The 3D window could not open. Use 3D preview in the field instead.'); return;
    }
    const stopStyles = prepareWindow(child);
    const root = child.document.createElement('div');
    root.className = 'popout-3d-root';
    child.document.body.append(root);
    setHost(root);
    const removeFrames = addFrameSource(child);
    let closed = false;
    // Closing the window unmounts the scene while its document exists, releasing the renderer.
    const finish = () => {
      if (closed) return;
      closed = true; closedAt.current = performance.now(); removeFrames(); flushSync(() => setHost(null)); stopStyles();
      if (store.getState().ui.popout3d === 'open') store.setValue('ui', 'popout3d', 'closed');
    };
    child.addEventListener('pagehide', finish);
    const poll = window.setInterval(() => { if (child.closed) finish(); }, 1000);
    const unload = () => child.close();
    window.addEventListener('pagehide', unload);
    return () => {
      removeFrames(); window.clearInterval(poll); window.removeEventListener('pagehide', unload); child.removeEventListener('pagehide', finish);
      stopStyles(); setHost(null);
      if (!closed) retained.current = { child, timer: window.setTimeout(() => { retained.current = null; closedAt.current = performance.now(); child.close(); }, 0) };
    };
  }, [popout, store, attempt]);
  useLayoutEffect(() => {
    if (!host) return;
    const root = host.ownerDocument.documentElement;
    root.dataset.theme = theme; root.style.setProperty('--ui-scale', String(uiScale));
  }, [host, theme, uiScale]);
  useEffect(() => { if (host) host.ownerDocument.title = `${controller.project.title} · 3D preview — Squidware`; }, [host, controller.project.title]);
  return host && popout === 'open' ? createPortal(<PopoutContent controller={controller} />, host) : null;
}

function PopoutContent({ controller }: { controller: EditorController }) {
  const [quality, setQuality] = useState<Stage3DQuality>('detailed');
  const [generation, setGeneration] = useState(0);
  const { project, playing, selectedIds } = controller;
  const { count, sample, rehearsalProject } = useFieldScene(controller);
  const set = project.sets[sample.setIndex];
  const moving = sample.setIndex > 0 && sample.progress < 1;
  const mode = playing ? 'Playing' : controller.formationPreview ? 'Formation preview' : controller.transformPreview ? 'Transform preview' : controller.spacingPreview ? 'Spacing preview' : controller.coordinatePreview ? 'Coordinate preview' : controller.selectionPreview ? 'Selection preview' : moving ? 'Between sets' : 'At set';
  const close = <HelpButton command="view.popout-close" title="Close 3D window" description="Close this window. 2D editing continues in the main window." onClick={() => controller.dispatch('view.popout-close')}>Close 3D window</HelpButton>;
  return <div className="popout-3d" data-count={count} data-set-index={sample.setIndex}>
    <header className="popout-3d__status" aria-label="Mirrored editor state">
      <strong>{moving ? `Move ${sample.setIndex} → ${sample.setIndex + 1}` : `Set ${sample.setIndex + 1}`} · {set.name}</strong>
      <span>Count {formatTransportCount(count, playing)}</span>
      <span>{mode}</span>
      <span>{selectedIds.length} selected · {rehearsalProject.performers.length === project.performers.length ? `${project.performers.length} performers` : `${rehearsalProject.performers.length} of ${project.performers.length} performers`}</span>
      <span className="popout-3d__note">Read-only · edit in the main window</span>
    </header>
    <div className="popout-3d__stage">
      <Mirrored3D key={generation} controller={controller} quality={quality} onQualityChange={setQuality} interactive={false}
        recovery={{ contextLost: 'The graphics context was interrupted. Reload the 3D preview to continue; editing in the main window is unaffected.',
          actions: <><HelpButton title="Reload 3D preview" description="Start a new graphics context in this window." onClick={() => setGeneration(value => value + 1)}>Reload 3D preview</HelpButton>{close}</> }} />
    </div>
  </div>;
}

/** Shown in the field area while the 3D view lives in its own window, so only one renderer runs. */
export function Popout3DPlaceholder({ controller }: { controller: EditorController }) {
  return <div className="stage-three"><div className="stage-three__fallback popout-3d-placeholder" role="status">
    <Box size={36} strokeWidth={1.3} aria-hidden="true" />
    <strong>3D preview is open in its own window</strong>
    <p>It follows this field’s set, count, playback and selection. Use the 2D field to edit positions.</p>
    <HelpButton command="view.popout" title="Show 3D window" description="Bring the 3D window to the front." onClick={() => controller.dispatch('view.popout')}>Show 3D window</HelpButton>
    <HelpButton command="view.popout-close" title="Return 3D here" description="Close the 3D window and show the 3D preview in this field area." onClick={() => controller.dispatch('view.popout-close')}>Return 3D here</HelpButton>
  </div></div>;
}

/** Canvas-toolbar action beside the 2D/3D switch; hidden where the desktop bridge is unavailable. */
export function Popout3DButton({ controller }: { controller: EditorController }) {
  const popout = useEditorSelector(state => state.ui.popout3d);
  if (popout === 'unavailable') return null;
  const open = popout === 'open';
  return <Button command="view.popout" title={open ? 'Show 3D window' : 'Open 3D window'} state={open ? 'Open in its own window' : 'Closed'}
    description={open ? 'Bring the separate 3D window to the front. It follows this editor’s set, count, playback and selection.' : 'Show the 3D preview in its own window, for example on a second display, while you edit in 2D here.'}
    className={`popout-3d-button${open ? ' is-open' : ''}`} onClick={() => controller.dispatch('view.popout')}><SquareArrowOutUpRight size={16} /></Button>;
}
