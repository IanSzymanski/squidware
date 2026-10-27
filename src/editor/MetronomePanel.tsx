import { useState } from 'react';
import { Modal } from '../components/Modal';
import { projectMeter, validateMeter } from '../meter';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import './metronome.css';

export function MetronomePanel({ controller }: { controller: EditorController }) {
  const playback = useEditorSelector(s => s.playback);
  const initial = projectMeter(controller.project);
  const [numerator, setNumerator] = useState(initial.numerator), [denominator, setDenominator] = useState(initial.denominator);
  const [grouping, setGrouping] = useState(initial.grouping.join('+'));
  const [enabled, setEnabled] = useState(playback.metronome), [bars, setBars] = useState(playback.countInBars), [speed, setSpeed] = useState(playback.speed);
  let error = '', meter = initial;
  try {
    if (!/^\s*\d+(\s*\+\s*\d+)*\s*$/.test(grouping)) throw new Error('Use beat groups such as 3+3 or 2+2+3.');
    meter = validateMeter({ numerator, denominator, grouping: grouping.split('+').map(Number) });
  } catch (e) { error = (e as Error).message.replace('Invalid project: ', ''); }
  function preset(value: string) {
    const [n, d] = value.split('/').map(Number);
    setNumerator(n); setDenominator(d); setGrouping(n > 3 && d === 8 ? Array(n / 3).fill(3).join('+') : String(n));
  }
  return <Modal title="Metronome and count-in" className="metronome-panel" onClose={() => controller.setDialog(null)}>
    <div className="metronome-fields">
    <p className="modal-intro">Set click accents for this production and a lead-in for rehearsal.</p>
    <label className="form-label">Meter preset<select aria-label="Meter preset" value={['3/4','4/4','6/8','9/8','12/8'].includes(`${numerator}/${denominator}`) ? `${numerator}/${denominator}` : ''} onChange={e => preset(e.target.value)}><option value="" disabled>Choose a meter…</option>{['3/4', '4/4', '6/8', '9/8', '12/8'].map(m => <option key={m}>{m}</option>)}</select></label>
    <details><summary>Custom meter · {numerator}/{denominator}</summary><div className="form-row"><label className="form-label">Beats per bar<select aria-label="Beats per bar" value={numerator} onChange={e => setNumerator(Number(e.target.value))}>{Array.from({ length: 32 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label><label className="form-label">Beat denominator<select aria-label="Beat denominator" value={denominator} onChange={e => setDenominator(Number(e.target.value))}>{[2, 4, 8, 16].map(n => <option key={n}>{n}</option>)}</select></label></div></details>
    <label className="form-label">Accent grouping<input aria-label="Accent grouping" value={grouping} maxLength={95} aria-invalid={!!error} aria-describedby="meter-error" onChange={e => setGrouping(e.target.value)} /></label>
    <p className="microcopy">Groups must add to {numerator}, for example 3+3 in 6/8. Bar, group and other beats use high, middle and low clicks.</p>
    {error && <p id="meter-error" role="status" className="field-error">{error}</p>}
    <h3 className="modal-subtitle">This rehearsal session</h3>
    <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Metronome during playback</label>
    <div className="form-row"><label className="form-label">Count-in<select aria-label="Count-in" value={bars} onChange={e => setBars(Number(e.target.value))}><option value="0">Off</option><option value="1">1 bar · {numerator} counts</option><option value="2">2 bars · {2 * numerator} counts</option></select></label><label className="form-label">Rehearsal speed<select aria-label="Rehearsal speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, .75, 1, 1.25, 1.5].map(n => <option key={n} value={n}>{n}×</option>)}</select></label></div>
    <details><summary>Timing and saved settings</summary><p className="microcopy">One drill count is one denominator beat; written tempos are counts per minute. This meter applies throughout the production, with bars starting at show count 0 across set boundaries. Productions without a meter use 4/4. Count-in uses the starting move tempo and holds the field and recording at the chosen count. Loops repeat without another lead-in. Meter saves with the production; click, count-in and speed settings last for this session.</p></details>
    </div>
    <div className="modal-actions"><button className="button subtle" onClick={() => controller.setDialog(null)}>Cancel</button><button className="button primary" disabled={!!error} onClick={() => controller.dispatch('metronome.configure', { meter, enabled, countInBars: bars, speed })}>Apply</button></div>
  </Modal>;
}
