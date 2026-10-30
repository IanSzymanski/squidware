import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { countToSeconds, totalCounts } from '../domain';
import { compileTempo, spanSeconds } from '../tempo';
import { emptyTempoMap, parseTempoText, tempoMapText } from './tempoMapText';
import type { EditorController } from './useEditorController';
import './score.css';

export function TempoPanel({ controller:c }: { controller:EditorController }) {
  const [initial] = useState(() => ({ project:c.project, text:tempoMapText(c.project.tempoMap??emptyTempoMap()), revision:c.store.getState().project.revision, epoch:c.projectEpoch }));
  const [regions,setRegions]=useState(initial.text.regions),[holds,setHolds]=useState(initial.text.holds),[submitError,setSubmitError]=useState('');
  const dirty=regions!==initial.text.regions||holds!==initial.text.holds;
  useEffect(()=>{c.setPendingDraft(dirty,'tempo-map');return()=>c.setPendingDraft(false,'tempo-map');},[dirty,c.setPendingDraft]);
  let error='',map=emptyTempoMap(),preview=compileTempo(initial.project);
  try {map=parseTempoText(regions,holds,totalCounts(initial.project));preview=compileTempo({...initial.project,tempoMap:map});}catch(e){error=(e as Error).message;}
  const stale=initial.revision!==c.store.getState().project.revision||initial.epoch!==c.projectEpoch;
  const original=countToSeconds(initial.project,totalCounts(initial.project));
  function close(){c.setPendingDraft(false,'tempo-map');c.setDialog(null);}
  function apply(){if(error||stale)return;c.setPendingDraft(false,'tempo-map');if(c.dispatch('tempo.save',{map,revision:initial.revision,epoch:initial.epoch})!==true){c.setPendingDraft(dirty,'tempo-map');setSubmitError(c.store.getState().ui.toast||'The production changed. Cancel and reopen.');}}
  const points=preview.spans.filter(s=>s.counts>0).flatMap(s=>[[s.count,s.tempo!],[s.count+s.counts,s.endTempo!]]);
  const x=(count:number)=>20+count/Math.max(1,preview.totalCounts)*600,y=(tempo:number)=>140-(tempo-20)/380*120;
  return <Modal title="Tempo map" onClose={close} wide className="score-panel">
    <div className="score-fields">
      <p className="modal-intro">Tempo ranges use absolute show counts. Equal BPM values make a fixed tempo; different values make a linear BPM ramp over counts. Gaps use each move’s base tempo. Reordering sets leaves these musical anchors in place.</p>
      <label className="form-label">Tempo ranges<textarea aria-label="Tempo ranges" rows={4} value={regions} onChange={e=>setRegions(e.target.value)} placeholder={'0,16,120,160\n16,32,160,160'} /></label>
      <p className="microcopy">CSV/TSV without headings: From count, To count, Start BPM, End BPM. Counts are whole numbers; ranges cannot overlap. Adjacent ranges can change tempo instantly. BPM: 20–400. At most 256 ranges.</p>
      <label className="form-label">Fermatas<textarea aria-label="Fermatas" rows={2} value={holds} onChange={e=>setHolds(e.target.value)} placeholder="8,2.5" /></label>
      <p className="microcopy">Count, Seconds. A fermata starts after that count’s click: the recording continues, positions freeze, and the metronome waits. Seeking to the count starts its hold; pause/resume preserves progress. Use distinct counts before the final count, 0.001–600 seconds each, up to 256 holds.</p>
      {(error||stale||submitError)&&<p className="field-error" role="alert">{stale?'The production changed. Copy your draft, then cancel and reopen.':error||submitError}</p>}
      {!error&&<>
        <p role="status" aria-label="Timing duration preview">{original.toFixed(3)}s saved → {preview.totalSeconds.toFixed(3)}s preview · {preview.totalCounts} counts, unchanged</p>
        <svg viewBox="0 0 640 165" role="img" aria-label="Tempo preview: BPM over show counts" style={{width:'100%',maxHeight:165,background:'var(--surface-muted)'}}><text x="20" y="15" fill="currentColor" fontSize="12">400 BPM</text><text x="20" y="159" fill="currentColor" fontSize="12">20 BPM · count 0</text><path d={points.map(([count,tempo],i)=>`${i?'L':'M'}${x(count)},${y(tempo)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />{map.holds.map(h=><g key={h.count}><line x1={x(h.count)} x2={x(h.count)} y1="20" y2="140" stroke="currentColor" strokeDasharray="3 3"/><title>Fermata at count {h.count}: {h.seconds}s</title></g>)}</svg>
        <div className="score-preview" role="region" tabIndex={0} aria-label="Timing preview"><table><thead><tr><th>Counts</th><th>BPM / hold</th><th>Starts at</th><th>Seconds</th></tr></thead><tbody>{preview.spans.map((s,i)=><tr key={i}><td>{s.counts?`${s.count}–${s.count+s.counts}`:s.count}</td><td>{s.holdSeconds!==undefined?`Fermata ${s.holdSeconds}s`:`${s.tempo!.toFixed(2)} → ${s.endTempo!.toFixed(2)}`}</td><td>{s.seconds.toFixed(3)}s</td><td>{spanSeconds(s).toFixed(3)}s</td></tr>)}</tbody></table></div>
      </>}
      <p className="microcopy">Apply is one undo action. A nonempty map saves as schema v3 so older apps cannot silently discard timing; removing all ranges and holds restores v2 saving. Plain move tempos remain the base values. Playback, metronome, duration, CSV and PDF use the shared map.</p>
    </div>
    <div className="modal-actions"><button className="button subtle" onClick={close}>Cancel</button><button className="button primary" aria-label="Apply tempo map" disabled={!dirty||!!error||stale} onClick={apply}>Apply tempo map · one undo</button></div>
  </Modal>;
}
