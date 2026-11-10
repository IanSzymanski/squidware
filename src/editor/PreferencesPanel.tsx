import { PROJECT_LIMITS } from '../domain';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Modal } from '../components/Modal';
import { FieldDisplayPreferences } from './FieldDisplayPreferences';
import { SnapSettingsFields } from './SnapSettingsFields';
import { NumberField } from '../components/NumberField';
import { ShortcutPreferences } from './ShortcutPreferences';
import { HelpButton } from './ControlHelp';
import { preferencesSectionAt, preferencesSections, type PreferencesSectionId } from './preferencesSections';
import type { EditorController } from './useEditorController';
export function PreferencesPanel({ controller }: { controller: EditorController }) {
  const { preferences, setDialog } = controller;
  const [resetVersion, setResetVersion] = useState(0);
  const [closeError, setCloseError] = useState('');
  const [current, setCurrent] = useState<PreferencesSectionId>('appearance');
  const nav = useRef<HTMLDivElement>(null); const jumped = useRef(-1); const uid = useId();
  // Every group stays mounted (the close guard and number drafts need all fields); the nav only scrolls.
  useEffect(() => {
    const bar = nav.current, dialog = bar?.closest('dialog'); if (!bar || !dialog) return;
    const follow = () => {
      const tops = preferencesSections.map(({ id }) => document.getElementById(uid + id)?.getBoundingClientRect().top ?? Infinity);
      const index = preferencesSectionAt(tops, bar.getBoundingClientRect().bottom, dialog.getBoundingClientRect().bottom, dialog.scrollTop > 0 && dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 2, jumped.current);
      if (index !== jumped.current) jumped.current = -1;
      setCurrent(preferencesSections[index].id);
    };
    // Scroll padding keeps jumps and keyboard-focused fields clear of the sticky nav.
    const pad = () => { dialog.style.scrollPaddingTop = `${bar.offsetHeight + 8}px`; };
    const resize = new ResizeObserver(pad); resize.observe(bar); pad();
    dialog.addEventListener('scroll', follow, { passive: true });
    return () => { resize.disconnect(); dialog.removeEventListener('scroll', follow); dialog.style.scrollPaddingTop = ''; };
  }, [uid]);
  function jump(index: number) {
    const heading = document.getElementById(uid + preferencesSections[index].id); if (!heading) return;
    jumped.current = index; setCurrent(preferencesSections[index].id);
    // Jumping to a group that is a single collapsed disclosure (Keyboard shortcuts) opens it.
    if (heading.nextElementSibling instanceof HTMLDetailsElement) heading.nextElementSibling.open = true;
    if (index) heading.scrollIntoView({ block: 'start' }); else heading.closest('dialog')?.scrollTo({ top: 0 });
    heading.focus({ preventScroll: true });
  }
  const section = (index: number, children: ReactNode) => { const { id, title } = preferencesSections[index]; return <section className="preferences-section" aria-labelledby={uid + id}><h3 id={uid + id} tabIndex={-1}>{title}</h3>{children}</section>; };
  function close() {
    flushSync(() => (document.activeElement as HTMLElement | null)?.blur());
    if (document.querySelector('.preferences-fields [aria-invalid="true"]')) { setCloseError('Correct the invalid preference or press Escape in that field to cancel it.'); return; }
    void preferences.flush(); setDialog(null);
  }
  async function reset() { if (await preferences.reset()) { setResetVersion(value => value + 1); setCloseError(''); } }
  // These drafts belong to personal settings; they must never dirty a production.
  const p = preferences.value; const update = preferences.update;
  return <Modal title="Preferences" onClose={close}>
    <p className="modal-intro">Personal settings for this device. Production files keep their own cast, geometry, field and timing.</p>
    <div ref={nav} className="preferences-nav" role="group" aria-label="Preferences sections">{preferencesSections.map(({ id, title, description }, index) => <HelpButton key={id} title={title} description={description} aria-pressed={current === id} className={current === id ? 'button primary' : 'button subtle'} onClick={() => jump(index)}>{title}</HelpButton>)}</div>
    {preferences.error && <p className="field-error" role="status">{preferences.error}</p>}
    {closeError && <p className="field-error" role="status">{closeError}</p>}
    <fieldset key={resetVersion} className="preferences-fields" disabled={preferences.status === 'loading'}>
      {section(0, <>
        <div className="form-row"><label className="form-label">Interface theme<select value={p.theme} onChange={e => update({ theme: e.target.value as typeof p.theme })}><option value="dark">Dark</option><option value="light">Light</option><option value="high-contrast">High contrast</option></select></label><label className="form-label">UI scale<select value={p.uiScale} onChange={e => update({ uiScale: Number(e.target.value) as typeof p.uiScale })}>{[1, 1.1, 1.25, 1.5].map(scale => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}</select></label></div>
        <p className="microcopy">Theme and scale apply immediately on this device. Field coordinates and saved section colors stay the same.</p>
        <label className="form-label">Panel layout<select value={p.panelLayout} onChange={e => update({ panelLayout: e.target.value as typeof p.panelLayout, workspaceLayout: { ...p.workspaceLayout, preset: 'custom', setsWidth: e.target.value === 'compact' ? 176 : 216, inspectorWidth: e.target.value === 'compact' ? 235 : 258 } })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        <p className="microcopy">Use Layout in the workspace header for individual widths, hidden panels and Write / Review / Rehearse presets.</p>
        <div className="preferences-toggles"><label><input type="checkbox" checked={p.showHints} onChange={e => update({ showHints: e.target.checked, ...(e.target.checked ? { selectionHintDismissed: false } : {}) })} />Show hints</label></div>
        <p className="microcopy">Short keyboard and mouse tips in the set list, field, status bar, Inspector, command palette and 3D preview. Tooltips and Help keep the same guidance when hints are off.</p>
      </>)}
      {section(1, <>
        <label className="form-label">Start view<select value={p.view} onChange={e => update({ view: e.target.value as typeof p.view })}><option value="2d">2D field</option><option value="3d">3D preview</option></select></label>
        <div className="preferences-toggles">{(['showPaths', 'showNextPaths', 'showGrid'] as const).map((key, i) => <label key={key}><input type="checkbox" checked={p[key]} onChange={e => update({ [key]: e.target.checked })} />{['Previous paths', 'Next paths', 'Field grid'][i]}</label>)}</div>
        <NumberField label="Field zoom" value={p.zoom} min={.6} max={3} step={.1} onChange={zoom => update({ zoom })} />
        <FieldDisplayPreferences preferences={preferences} />
        <h4 className="modal-subtitle">Coordinates</h4><label className="form-label">Coordinate precision<select value={p.coordinatePrecision} onChange={e => update({ coordinatePrecision: e.target.value as typeof p.coordinatePrecision })}><option value="whole">Whole steps</option><option value="half">Half steps</option><option value="quarter">Quarter steps</option><option value="decimal">Decimal steps (legacy)</option></select></label>{p.coordinatePrecision === 'decimal' && <label className="form-label">Coordinate decimals<select value={p.coordinateDecimals} onChange={e => update({ coordinateDecimals: Number(e.target.value) as typeof p.coordinateDecimals })}>{[0, 1, 2].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}<p className="microcopy">Round displayed coordinates in 8-to-5 steps (0.625 yd per step). Stored positions and movement geometry stay exact. See Help for side, goal-line and hash conventions.</p>
      </>)}
      {section(2, <>
        <h4 className="modal-subtitle">Editing increments</h4><label className="form-label">Nudge units<select value={p.nudgeUnit} onChange={e => update({ nudgeUnit: e.target.value as typeof p.nudgeUnit })}><option value="yards">Yards</option><option value="steps">Production step size</option></select></label>
        <div className="form-row"><NumberField label={`Nudge · ${p.nudgeUnit}`} value={p.nudgeStep} min={.125} max={5} step={.125} onChange={nudgeStep => update({ nudgeStep })} /><NumberField label={`Fast nudge · ${p.nudgeUnit}`} value={p.fastNudgeStep} min={.125} max={10} step={.125} onChange={fastNudgeStep => update({ fastNudgeStep })} /></div>
        <p className="microcopy">Steps use the current production’s 8/6/12-to-5 step size, independently of grid subdivision. Alt+arrows and move buttons share these requests; Shift+Alt or Shift-click uses the fast amount. Snap targets and field edges can change the accepted distance.</p>
        <div className="form-row"><NumberField label="Rotate preset · degrees" value={p.rotationStep} min={.1} max={180} step={.1} onChange={rotationStep => update({ rotationStep })} /><NumberField label="Scale preset · %" value={p.scaleStep} min={.1} max={99} step={.1} onChange={scaleStep => update({ scaleStep })} /></div>
        <p className="microcopy">Rotation and scale buttons start an exact preview using these increments. Apply commits; Cancel keeps the original positions.</p>
        <div className="preferences-toggles"><label><input type="checkbox" checked={p.snap} onChange={e => update({ snap: e.target.checked })} />Snap to grid</label></div>
        <h4 className="modal-subtitle">Set creation</h4><NumberField label="New move counts" value={p.newSetCounts} min={PROJECT_LIMITS.counts.min} max={PROJECT_LIMITS.counts.max} integer onChange={newSetCounts => update({ newSetCounts })} /><p className="microcopy">New sets, holds, insertions and copies of the opening set start with these counts. Other duplicates copy their incoming timing. Review timing in Add set before applying.</p>
        <h4 className="modal-subtitle">Default formation tools</h4><label className="form-label">Shape<select value={p.formation} onChange={e => update({ formation: e.target.value as typeof p.formation })}>{['line', 'arc', 'circle', 'block', 'curve'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <div className="form-row"><NumberField label="Width · yards" value={p.formationWidth} min={1} max={95} onChange={formationWidth => update({ formationWidth })} /><NumberField label="Depth · yards" value={p.formationHeight} min={1} max={48} onChange={formationHeight => update({ formationHeight })} /></div>
        <div className="form-row"><NumberField label="Rotation · degrees" value={p.formationRotation} min={-180} max={180} onChange={formationRotation => update({ formationRotation })} /><NumberField label="Block columns" value={p.formationColumns} min={1} max={500} integer onChange={formationColumns => update({ formationColumns })} /></div>
        <p className="microcopy">New shapes start sized to the selection, spread to the production’s minimum spacing and kept inside the field. Width and depth are used when a selection has no extent, such as one performer; depth also limits how deep a new arc, circle or wave starts. Rotation and columns always apply.</p>
        <h4 className="modal-subtitle">New production placement defaults</h4><SnapSettingsFields value={p.snapDefaults} onChange={snapDefaults => update({ snapDefaults })} />
        <p className="microcopy">These defaults apply when creating a production. Use Grid and snapping in the field toolbar to change the current production.</p>
        <h4 className="modal-subtitle">New production analysis defaults</h4><div className="form-row"><NumberField label="Spacing · yards" value={p.minimumSpacing} min={PROJECT_LIMITS.analysisThreshold.min} max={PROJECT_LIMITS.analysisThreshold.max} step={.1} onChange={minimumSpacing => update({ minimumSpacing })} /><NumberField label="Stride · yards/count" value={p.maximumStride} min={PROJECT_LIMITS.analysisThreshold.min} max={PROJECT_LIMITS.analysisThreshold.max} step={.1} onChange={maximumStride => update({ maximumStride })} /></div>
        <p className="microcopy">These values apply only when creating a production. Analysis rules (in Show-wide problems or command search) edit the saved rules for the current production; opening an older file uses its rules or the historical 1 yd / 1.25 yd-per-count defaults.</p>
        <h4 className="modal-subtitle">Print defaults</h4><div className="form-row"><label className="form-label">Paper<select value={p.paperSize} onChange={e => update({ paperSize: e.target.value as typeof p.paperSize })}><option value="letter">Letter</option><option value="a4">A4</option></select></label><label className="form-label">Packet default<select value={p.printMode} onChange={e => update({ printMode: e.target.value as typeof p.printMode })}><option value="charts">Field charts</option><option value="coordinates">Coordinates</option></select></label></div>
      </>)}
      {section(3, <ShortcutPreferences preferences={preferences} />)}
    </fieldset>
    <p className="microcopy" role="status">{preferences.status === 'saved' ? 'Preferences saved on this device' : preferences.status === 'unavailable' ? 'Preferences unavailable · Retry or reset' : 'Saving preferences…'}</p>
    <div className="modal-actions"><button className="button subtle" disabled={preferences.status === 'loading'} onClick={() => void reset()}>Reset defaults</button><button className="button subtle" disabled={preferences.status === 'loading'} onClick={() => void preferences.flush()}>Retry save</button><button className="button primary" onClick={close}>Done</button></div>
  </Modal>;
}
