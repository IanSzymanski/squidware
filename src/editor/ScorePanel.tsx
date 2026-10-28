import { useEffect, useMemo, useState } from 'react';
import { PROJECT_LIMITS } from '../domain';
import { Modal } from '../components/Modal';
import { compileScore, countForScore, defaultScore, scoreLabel, scorePosition, validateScore } from '../score';
import { meterText, parseMeterText, projectMeter } from '../meter';
import { parseSheetText } from './productionSheet';
import type { ScoreMap } from '../types';
import type { EditorController } from './useEditorController';
import './score.css';

function eventText(score: ScoreMap) {
  const counts=[...new Set([...score.changes.map(c=>c.count),...score.marks.map(m=>m.count)])].sort((a,b)=>a-b);
  const quote=(s:string)=>`"${s.replaceAll('"','""')}"`;
  return counts.map(count=>[String(count),score.changes.find(c=>c.count===count)?meterText(score.changes.find(c=>c.count===count)!.meter):'',score.marks.find(m=>m.count===count)?.label??''].map(quote).join(',')).join('\n');
}
export function ScorePanel({controller}:{controller:EditorController}) {
  const {project,store,dispatch,setPendingDraft}=controller;
  const savedMap=useMemo(()=>compileScore(project),[project]);
  const [initial]=useState(()=>({meter:meterText(projectMeter(project)),score:project.score??defaultScore(),revision:store.getState().project.revision,epoch:controller.projectEpoch}));
  const [opening,setOpening]=useState(initial.meter),[first,setFirst]=useState(String(initial.score.firstMeasure)),[pickup,setPickup]=useState(String(initial.score.pickupCounts)),[text,setText]=useState(()=>eventText(initial.score));
  const [measure,setMeasure]=useState('1'),[beat,setBeat]=useState('1'),[submitError,setSubmitError]=useState('');
  const dirty=opening!==initial.meter||first!==String(initial.score.firstMeasure)||pickup!==String(initial.score.pickupCounts)||text!==eventText(initial.score);
  useEffect(()=>{setPendingDraft(dirty,'score-map');return()=>setPendingDraft(false,'score-map');},[dirty,setPendingDraft]);
  let error='',meter=projectMeter(project),score=initial.score,map=savedMap;
  try {
    meter=parseMeterText(opening);
    if(!first.trim()||!pickup.trim())throw Error('Enter the first full measure and pickup count.');
    const changes:ScoreMap['changes']=[],marks:ScoreMap['marks']=[];
    for(const [i,row] of (text.trim()?parseSheetText(text,{maxRows:PROJECT_LIMITS.scoreEvents*2,maxColumns:3}):[]).entries()) {
      if(row.length!==3)throw Error(`Event row ${i+1}: use exactly Count, Meter, Mark (blank cells are allowed).`);
      const count=row[0].trim()?Number(row[0]):NaN;
      if(!Number.isInteger(count)||count<0)throw Error(`Event row ${i+1}: count must be a nonnegative whole number.`);
      if(row[1].trim()) {if(count===0)throw Error('Use the Opening meter field for count 0.');changes.push({count,meter:parseMeterText(row[1])});}
      if(row[2].trim())marks.push({count,label:row[2]});
      if(!row[1].trim()&&!row[2].trim())throw Error(`Event row ${i+1}: supply a meter change or rehearsal mark.`);
    }
    score=validateScore({firstMeasure:Number(first),pickupCounts:Number(pickup),changes,marks});map=compileScore({...project,meter,score});
  }catch(e){error=(e as Error).message;}
  const stale=initial.revision!==store.getState().project.revision||initial.epoch!==controller.projectEpoch;
  let target:number|undefined,seekError='';
  try{target=countForScore(savedMap,measure.trim()?Number(measure):NaN,beat.trim()?Number(beat):NaN);}catch(e){seekError=(e as Error).message;}
  function close(){setPendingDraft(false,'score-map');dispatch('dialog.open',{dialog:null});}
  function apply(){if(error||stale)return;setPendingDraft(false,'score-map');if(dispatch('score.save',{meter,score,revision:initial.revision,epoch:initial.epoch})!==true){setPendingDraft(dirty,'score-map');setSubmitError(store.getState().ui.toast||'The production changed. Cancel and reopen the map.');}}
  function navigate(m:number,b:number){if(dirty||stale)return;dispatch('score.seek',{measure:m,beat:b});}
  return <Modal title="Score map" onClose={close} wide className="score-panel">
    <div className="score-fields">
      <p className="modal-intro">One drill count is one denominator beat; written BPM and motion stay unchanged. Meter changes start full bars. Anchors use absolute show counts and stay there when drill timing changes.</p>
      <div className="score-settings"><label className="form-label">Opening meter<input aria-label="Opening meter" value={opening} onChange={e=>setOpening(e.target.value)} placeholder="4/4:4" /></label><label className="form-label">First full measure<input aria-label="First full measure" type="number" min={1} max={PROJECT_LIMITS.scoreMeasures} value={first} onChange={e=>setFirst(e.target.value)} /></label><label className="form-label">Pickup counts<input aria-label="Pickup counts" type="number" min={0} max={31} value={pickup} onChange={e=>setPickup(e.target.value)} /></label></div>
      <label className="form-label">Meter changes and rehearsal marks<textarea aria-label="Score events" rows={3} value={text} onChange={e=>setText(e.target.value)} placeholder={'10,6/8:3+3,A\n22,7/8:2+2+3,B'} /></label>
      <p className="microcopy">CSV/TSV without headings: Count, Meter, Mark. Blank meter keeps the current meter; blank mark adds no label. Examples: <code>16,3/4,A</code> or <code>8,,Intro</code>. Quote labels containing commas. Pickup beats finish the preceding measure; 2 pickup counts in 4/4 start at beat 3.</p>
      {(error||stale||submitError)&&<p className="field-error" role="alert">{stale?'The production changed. Copy your draft, then cancel and reopen this map.':error||submitError}</p>}
      {!error&&<div className="score-preview" aria-label="Score preview"><table><thead><tr><th>Count</th><th>Score position</th><th>Meter / mark</th></tr></thead><tbody>{[...new Set([0,...score.changes.map(c=>c.count),...score.marks.map(m=>m.count)])].sort((a,b)=>a-b).map(count=><tr key={count}><td>{count}</td><td>{scoreLabel(map,count)}</td><td>{meterText(scorePosition(map,count).meter)} {score.marks.find(m=>m.count===count)?.label}</td></tr>)}</tbody></table></div>}
      <details className="score-navigation" open={!dirty}><summary>Rehearsal navigation</summary>
        <p className="microcopy">{dirty?'Apply map edits before navigating.':'Navigate using the saved map. Playback stops at the selected count.'}</p>
        <div className="score-settings"><label className="form-label">Measure<input aria-label="Go to measure" type="number" value={measure} onChange={e=>setMeasure(e.target.value)} /></label><label className="form-label">Beat<input aria-label="Go to beat" type="number" step="any" value={beat} onChange={e=>setBeat(e.target.value)} /></label><button className="button subtle" aria-label="Go to score position" disabled={dirty||stale||!!seekError} onClick={()=>navigate(Number(measure),Number(beat))}>Go{target===undefined?'':` · count ${target}`}</button></div>
        {seekError&&!dirty&&<p className="field-error" role="status">{seekError}</p>}
        <div className="score-marks">{savedMap.marks.map(mark=>{const p=scorePosition(savedMap,mark.count);return <button key={mark.count} className="button subtle" aria-label={`Go to rehearsal mark ${mark.label}`} disabled={dirty||stale} onClick={()=>navigate(p.measure,p.beat)}>{mark.label} · {scoreLabel(savedMap,mark.count)} · count {mark.count}</button>;})}</div>
      </details>
    </div>
    <div className="modal-actions"><button className="button subtle" onClick={close}>Cancel</button><button className="button primary" aria-label="Apply score map" disabled={!dirty||!!error||stale} onClick={apply}>Apply score map · one undo</button></div>
  </Modal>;
}
