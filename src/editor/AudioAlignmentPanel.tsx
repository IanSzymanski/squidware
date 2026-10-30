import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { countToSeconds, sampleTimeline, setStartCount, totalCounts } from '../domain';
import { compileTempo } from '../tempo';
import { PROJECT_LIMITS } from '../projectValidation';
import { audioAnchorText, parseAudioAnchorText } from './audioAnchorText';
import type { AudioAnchor } from '../types';
import type { EditorController } from './useEditorController';
import './score.css';

export function AudioAlignmentPanel({ controller: c }: { controller: EditorController }) {
  const [initial] = useState(() => ({ project: c.project, text: audioAnchorText(c.project.audioAnchors ?? [], c.project.audioOffsetSeconds),
    revision: c.store.getState().project.revision, epoch: c.projectEpoch }));
  const [text, setText] = useState(initial.text), [offset, setOffset] = useState(String(initial.project.audioOffsetSeconds));
  const [count, setCount] = useState(String(Math.max(1, Math.round(c.store.getState().playback.count))));
  const [time, setTime] = useState(0), [submitError, setSubmitError] = useState('');
  const previewAudio = useRef<HTMLAudioElement>(null), total = totalCounts(initial.project);
  const dirty = text !== initial.text || offset !== String(initial.project.audioOffsetSeconds);
  const stale = initial.revision !== c.store.getState().project.revision || initial.epoch !== c.projectEpoch;
  useEffect(() => { c.setPendingDraft(dirty, 'audio-alignment'); return () => c.setPendingDraft(false, 'audio-alignment'); }, [dirty, c.setPendingDraft]);
  const nominal = { ...initial.project, audioAnchors: undefined };
  let previewProject = initial.project;
  let error = '', anchors: AudioAnchor[] = [], duration = countToSeconds(initial.project, total);
  const shift = Number(offset);
  try {
    if (!offset.trim() || !Number.isFinite(shift) || shift < PROJECT_LIMITS.audioOffsetSeconds.min || shift > PROJECT_LIMITS.audioOffsetSeconds.max) throw Error('Offset must be a finite number from -3600 to 3600 seconds.');
    anchors = parseAudioAnchorText(text, shift, total);
    previewProject = { ...initial.project, audioAnchors: anchors };
    duration = compileTempo(previewProject).totalSeconds;
  } catch (e) { error = (e as Error).message; }
  const available = !!c.audioUrl && c.portableAudio.audioDuration > 0;
  const canAdd = available && Number.isInteger(Number(count)) && Number(count) > 0 && Number(count) <= total && !stale;
  function capture() {
    if (!canAdd) return;
    const seconds = previewAudio.current?.currentTime ?? time;
    setText(value => `${value.trim()}${value.trim() ? '\n' : ''}${count},${seconds.toFixed(6)}`);
    setCount(String(Math.min(total + 1, Number(count) + 1)));
  }
  function close() { previewAudio.current?.pause(); c.setPendingDraft(false, 'audio-alignment'); c.setDialog(null); }
  function apply() {
    if (error || stale) return;
    previewAudio.current?.pause(); c.setPendingDraft(false, 'audio-alignment');
    if (c.dispatch('audio.align-save', { anchors, offset: shift, revision: initial.revision, epoch: initial.epoch }) !== true) {
      c.setPendingDraft(dirty, 'audio-alignment'); setSubmitError(c.store.getState().ui.toast || 'The production changed. Cancel and reopen.');
    }
  }
  return <Modal title="Align recording" onClose={close} wide className="score-panel">
    <div className="score-fields">
      <p className="modal-intro">Match show counts to recording times. Count zero uses the offset. Between anchors, elapsed time follows the written tempo curve scaled to fit; after the last anchor, its scale continues. Musical counts and positions stay unchanged.</p>
      {total===0 && <p role="status">Add a second set with move counts before adding anchors. You can still adjust the count-zero offset.</p>}
      <label className="form-label">Count zero · recording offset in seconds<input aria-label="Alignment offset" type="number" step="any" value={offset} onChange={e => setOffset(e.target.value)} /></label>
      <label className="form-label">Count, Recording seconds<textarea aria-label="Audio anchors" rows={4} value={text} onChange={e => setText(e.target.value)} placeholder={'8,4.6\n16,9.2'} /></label>
      <p className="microcopy">CSV/TSV, no headings; up to 256 rows. {total ? `Counts must be distinct whole numbers from 1 to ${total}.` : 'Add a move before defining count anchors.'} Recording times must increase after the offset. Anchors use absolute show counts; set reordering leaves them in place. Clear the rows to remove alignment.</p>
      {(error || stale || submitError) && <p role="alert" className="field-error">{stale ? 'The production changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
      <details className="score-navigation">
        <summary>Waveform and tap assistance</summary>
        {available ? <>
          <audio aria-label="Alignment recording preview" controls src={c.audioUrl} ref={previewAudio} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onError={() => setSubmitError('Recording preview unavailable. Anchors can still be edited manually.')} style={{ width: '100%' }} />
          <svg viewBox="0 0 640 65" role="img" aria-label="Recording waveform with anchor markers" style={{ width: '100%', background: 'var(--surface-muted)' }}>
            {c.waveform.map((peak, i) => <line key={i} x1={(i + .5) / c.waveform.length * 640} x2={(i + .5) / c.waveform.length * 640} y1={32 - peak * 30} y2={32 + peak * 30} stroke="currentColor" />)}
            {!error && anchors.map(a => <g key={a.count}><line x1={(a.seconds + shift) / c.portableAudio.audioDuration * 640} x2={(a.seconds + shift) / c.portableAudio.audioDuration * 640} y1="0" y2="65" stroke="var(--accent)" strokeWidth="2" /><title>Count {a.count} at {(a.seconds + shift).toFixed(3)} seconds</title></g>)}
          </svg>
          <label className="form-label">Recording time · {time.toFixed(3)}s<input aria-label="Alignment recording time" type="range" min={0} max={c.portableAudio.audioDuration} step="0.001" value={time} onChange={e => { const value = Number(e.target.value); setTime(value); if (previewAudio.current) previewAudio.current.currentTime = value; }} /></label>
          <div className="score-settings">
            <label className="form-label">Set arrival<select aria-label="Anchor set arrival" disabled={!total} value={initial.project.sets.slice(1).some((_,i)=>setStartCount(initial.project,i+1)===Number(count))?count:''} onChange={e => setCount(e.target.value)}><option value="">Choose a set…</option>{initial.project.sets.slice(1).map((s, i) => <option key={s.id} value={setStartCount(initial.project, i + 1)}>Set {i + 2} · {s.name}</option>)}</select></label>
            <label className="form-label">Next show count<input aria-label="Anchor show count" disabled={!total} type="number" min={1} max={total} value={count} onChange={e => setCount(e.target.value)} /></label>
            <button className="button subtle" aria-label="Tap recording anchor" disabled={!canAdd} onClick={capture}>Tap / add anchor</button>
          </div>
          <p className="microcopy">Play the preview, then tap this button with Enter or Space on each beat. Each tap appends the current recording time and advances the count. Pause and use the waveform slider for precise placement. Review all rows before Apply; taps never change the saved map.</p>
        </> : <p className="microcopy">Attach or relink a recording for waveform and tap assistance. Manual alignment and silent rehearsal remain available.</p>}
      </details>
      {!error && <>
        <p role="status" aria-label="Alignment duration preview">{countToSeconds(initial.project, total).toFixed(3)}s saved → {duration.toFixed(3)}s preview · {total} counts</p>
        {available && anchors.some(a => a.seconds + shift > c.portableAudio.audioDuration) && <p className="microcopy">Some anchors are beyond this recording. Playback continues silently after the audio ends.</p>}
        <div className="score-preview" role="region" tabIndex={0} aria-label="Audio alignment preview"><table><thead><tr><th>Count / set</th><th>Recording</th><th>Written drift</th><th>Saved error</th><th>Preview error</th></tr></thead><tbody>{anchors.map(a => <tr key={a.count}><td>{a.count} · to set {sampleTimeline(initial.project, a.count).setIndex + 1}</td><td>{(a.seconds + shift).toFixed(3)}s</td><td>{(a.seconds - countToSeconds(nominal, a.count)).toFixed(3)}s</td><td>{(a.seconds + shift - countToSeconds(initial.project, a.count) - initial.project.audioOffsetSeconds).toFixed(3)}s</td><td>{(a.seconds-countToSeconds(previewProject,a.count)).toFixed(3)}s</td></tr>)}</tbody></table></div>
      </>}
      <p className="microcopy">Positive drift means the recording arrives later. Interval durations must be 0.05–20× the written timing; fermatas scale with their interval. Changing the offset keeps entered recording times fixed. Production settings can shift the complete saved alignment. Plain project files save timing metadata only; use Portable production to transfer audio.</p>
    </div>
    <div className="modal-actions"><button className="button subtle" onClick={close}>Cancel</button><button className="button primary" aria-label="Apply audio alignment" disabled={!dirty || !!error || stale} onClick={apply}>Apply alignment · one undo</button></div>
  </Modal>;
}
