import { useState } from 'react';
import { flushSync } from 'react-dom';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import type { EditorController } from './useEditorController';
export function PreferencesPanel({ controller }: { controller: EditorController }) {
  const { preferences, setDialog } = controller;
  const [resetVersion, setResetVersion] = useState(0);
  const [closeError, setCloseError] = useState('');
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
    {preferences.error && <p className="field-error" role="status">{preferences.error}</p>}
    {closeError && <p className="field-error" role="status">{closeError}</p>}
    <fieldset key={resetVersion} className="preferences-fields" disabled={preferences.status === 'loading'}>
      <label className="form-label">Panel layout<select value={p.panelLayout} onChange={e => update({ panelLayout: e.target.value as typeof p.panelLayout })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
      <label className="form-label">Start view<select value={p.view} onChange={e => update({ view: e.target.value as typeof p.view })}><option value="2d">2D field</option><option value="3d">3D preview</option></select></label>
      <div className="preferences-toggles">{(['showLabels', 'showPaths', 'showNextPaths', 'showGrid', 'snap'] as const).map((key, i) => <label key={key}><input type="checkbox" checked={p[key]} onChange={e => update({ [key]: e.target.checked })} />{['Performer labels', 'Previous paths', 'Next paths', 'Field grid', 'Snap to grid'][i]}</label>)}</div>
      <NumberField label="Field zoom" value={p.zoom} min={.6} max={3} step={.1} onChange={zoom => update({ zoom })} />
      <div className="form-row"><NumberField label="Nudge · yards" value={p.nudgeStep} min={.125} max={5} step={.125} onChange={nudgeStep => update({ nudgeStep })} /><NumberField label="Fast nudge · yards" value={p.fastNudgeStep} min={.125} max={10} step={.125} onChange={fastNudgeStep => update({ fastNudgeStep })} /></div>
      <label className="form-label">Coordinate precision<select value={p.coordinatePrecision} onChange={e => update({ coordinatePrecision: e.target.value as typeof p.coordinatePrecision })}><option value="whole">Whole steps</option><option value="half">Half steps</option><option value="quarter">Quarter steps</option><option value="decimal">Decimal steps (legacy)</option></select></label>{p.coordinatePrecision === 'decimal' && <label className="form-label">Coordinate decimals<select value={p.coordinateDecimals} onChange={e => update({ coordinateDecimals: Number(e.target.value) as typeof p.coordinateDecimals })}>{[0, 1, 2].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}<p className="microcopy">Round displayed coordinates in 8-to-5 steps (0.625 yd per step). Stored positions and movement geometry stay exact. See Help for side, goal-line and hash conventions.</p>
      <div className="form-row"><label className="form-label">Paper<select value={p.paperSize} onChange={e => update({ paperSize: e.target.value as typeof p.paperSize })}><option value="letter">Letter</option><option value="a4">A4</option></select></label><label className="form-label">Packet default<select value={p.printMode} onChange={e => update({ printMode: e.target.value as typeof p.printMode })}><option value="charts">Field charts</option><option value="coordinates">Coordinates</option></select></label></div>
      <h3 className="modal-subtitle">Default formation tools</h3><label className="form-label">Shape<select value={p.formation} onChange={e => update({ formation: e.target.value as typeof p.formation })}>{['line', 'arc', 'circle', 'block', 'curve'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className="form-row"><NumberField label="Width · yards" value={p.formationWidth} min={1} max={95} onChange={formationWidth => update({ formationWidth })} /><NumberField label="Depth · yards" value={p.formationHeight} min={1} max={48} onChange={formationHeight => update({ formationHeight })} /></div>
      <div className="form-row"><NumberField label="Rotation · degrees" value={p.formationRotation} min={-180} max={180} onChange={formationRotation => update({ formationRotation })} /><NumberField label="Block columns" value={p.formationColumns} min={1} max={500} integer onChange={formationColumns => update({ formationColumns })} /></div>
      <h3 className="modal-subtitle">Geometric check defaults</h3><div className="form-row"><NumberField label="Spacing · yards" value={p.minimumSpacing} min={.1} max={5} step={.1} onChange={minimumSpacing => update({ minimumSpacing })} /><NumberField label="Stride · yards/count" value={p.maximumStride} min={.1} max={5} step={.1} onChange={maximumStride => update({ maximumStride })} /></div>
    </fieldset>
    <p className="microcopy" role="status">{preferences.status === 'saved' ? 'Preferences saved on this device' : preferences.status === 'unavailable' ? 'Preferences unavailable · Retry or reset' : 'Saving preferences…'}</p>
    <div className="modal-actions"><button className="button subtle" disabled={preferences.status === 'loading'} onClick={() => void reset()}>Reset defaults</button><button className="button subtle" disabled={preferences.status === 'loading'} onClick={() => void preferences.flush()}>Retry save</button><button className="button primary" onClick={close}>Done</button></div>
  </Modal>;
}
