import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Tooltip } from '../components/Tooltip';
import { FieldDrawing } from '../components/Field2D';
import { sampleProject, setStartCount, uid, validateProjectEdit } from '../domain';
import { copyIntervals, resolveIntervals } from '../movementPathOperations';
import type { PasteFrame } from '../movementPathOperations';
import { movementSvg } from '../movementPaths';
import { HelpButton } from './ControlHelp';
import { pathOperationPlan } from './pathOperationReview';
import type { PathOperationRequest, PathOperation } from './pathOperationReview';
import type { EditorController } from './useEditorController';
import './paths.css';

export function PathOperationsPanel({ controller: c }: { controller: EditorController }) {
  const [initial] = useState(() => {
    const s=c.store.getState(), index=Math.max(0,c.index-1), project=c.project;
    return {project,index,moveId:project.moves[index].id,activeSetId:project.sets[c.index].id,ids:[...c.selectedIds],revision:s.project.revision,epoch:c.projectEpoch,clipboard:s.ui.movementClipboard,seed:uid()};
  });
  const {project,index,ids,clipboard}=initial, move=project.moves[index];
  const source=ids.length===1?resolveIntervals(project,index,ids[0]):[];
  const [kind,setKind]=useState<'resize'|'reverse'|'copy'|'paste'>('resize'),[counts,setCounts]=useState(String(move.counts));
  const [selected,setSelected]=useState(source.map(r=>r.segment.id)),[whole,setWhole]=useState(true);
  const [at,setAt]=useState('0'),[duration,setDuration]=useState(String(move.counts)),[frame,setFrame]=useState<PasteFrame>('fit'),[accept,setAccept]=useState(false);
  const [progress,setProgress]=useState(25),[submitError,setSubmitError]=useState('');
  const dirty=kind==='reverse'||kind==='paste'||kind==='resize'&&counts!==String(move.counts);
  useEffect(()=>{c.setPendingDraft(dirty,'path-operations');return()=>c.setPendingDraft(false,'path-operations');},[dirty,c.setPendingDraft]);
  const op:PathOperation=kind==='resize'?{kind:'resize',counts:Number(counts)}:kind==='paste'?{kind:'paste',clipboardId:clipboard?.id??'',options:{performerId:ids[0],startCount:Number(at),duration:Number(duration),frame,seed:initial.seed,allowTargetTiming:accept}}:{kind:'reverse'};
  const request:PathOperationRequest={moveId:initial.moveId,activeSetId:initial.activeSetId,ids,revision:initial.revision,epoch:initial.epoch,operation:op};
  let candidate=project,error='',summary='';
  try {
    if(kind==='copy') {
      if(ids.length!==1)throw Error('Select exactly one source performer before copying.');
      const clip=copyIntervals(project,index,ids[0],selected,whole,initial.seed,initial.epoch);
      summary=`Copy ${clip.intervals.length} intervals from ${clip.sourceLabel}, local counts ${clip.startCount}–${clip.endCount}. Gaps inside this window are retained. This clipboard stays inside this production session; no system clipboard or history change.`;
    } else {
      if(kind==='resize'&&!counts.trim()||kind==='paste'&&(!at.trim()||!duration.trim()))throw Error('Enter finite counts for the reviewed operation.');
      const plan=pathOperationPlan(project,request,clipboard);candidate=plan.project;summary=plan.summary;validateProjectEdit(project,candidate);
    }
  }catch(e){error=(e as Error).message;}
  const s=c.store.getState(),stale=s.project.revision!==initial.revision||c.projectEpoch!==initial.epoch||project.sets[c.index]?.id!==initial.activeSetId||JSON.stringify(c.selectedIds)!==JSON.stringify(ids)||kind==='paste'&&s.ui.movementClipboard?.id!==clipboard?.id;
  const nextMove=candidate.moves[index],oldCount=move.counts*progress/100,newCount=nextMove.counts*progress/100;
  const before=sampleProject(project,setStartCount(project,index)+oldCount).positions,after=sampleProject(candidate,setStartCount(candidate,index)+newCount).positions;
  const names=ids.map(id=>project.performers.find(p=>p.id===id)?.label??id);
  function close(){c.setPendingDraft(false,'path-operations');c.setDialog(null);}
  function apply(){
    if(error||stale)return;c.setPendingDraft(false,'path-operations');
    const ok=kind==='copy'?c.dispatch('path.copy-intervals',{moveId:initial.moveId,activeSetId:initial.activeSetId,ids,revision:initial.revision,epoch:initial.epoch,performerId:ids[0],segmentIds:selected,wholeMove:whole}):c.dispatch('path.operation-apply',request);
    if(ok!==true){c.setPendingDraft(dirty,'path-operations');setSubmitError(c.store.getState().ui.toast||'Cancel and reopen to review the current move.');}
  }
  function number(label:string,value:string,onChange:(v:string)=>void){return <label className="form-label">{label}<Tooltip name={label} description="Local written counts. Changes update the preview without editing the production."><input type="number" aria-label={label} value={value} min={0} max={1024} step="any" onChange={e=>onChange(e.target.value)}/></Tooltip></label>;}
  return <Modal title="Move operations" onClose={close} wide className="path-panel path-operations-panel"><div className="path-fields">
    <p className="modal-intro">{project.sets[index].name} → {project.sets[index+1].name} · {move.counts} counts. {c.index===0?'At the opening, these operations target the first outgoing move.':'These operations target the incoming move.'}</p>
    <label className="form-label">Operation<Tooltip name="Move operation" description="Choose whole-move count resizing, selected-path reversal, or a reviewed interval copy/paste."><select aria-label="Move operation" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setSubmitError('');}}><option value="resize">Resize move counts</option><option value="reverse">Reverse selected paths</option><option value="copy">Copy selected intervals</option><option value="paste">Paste copied intervals</option></select></Tooltip></label>
    {kind==='resize'&&<>{number('New move counts',counts,setCounts)}<p className="microcopy">Affects every performer in this move. Uniformly rescale all interval counts; retain geometry, holds and IDs. Musical anchors stay at absolute show counts. Unrepresentable intervals or stranded musical anchors reject the whole edit.</p></>}
    {kind==='reverse'&&<p className="microcopy">Explicit selection: {names.length?`${names.slice(0,8).join(', ')}${names.length>8?` and ${names.length-8} more`:''}`:'none — select performers before reversing'}. Swap these performers’ dots in both endpoint pictures, reverse interval order and curve controls, and exchange leading/trailing holds. Adjacent moves inherit the new endpoint dots. Set order, counts, tempos and travel-technique declarations stay fixed.</p>}
    {kind==='copy'&&<><p className="microcopy">Source: {names.length===1?names[0]:'select exactly one performer'}. Select one contiguous interval range. Copy retains a snapshot; later source edits do not change it.</p>
      <label className="form-label"><span><Tooltip name="Include whole move and outer holds" description="Select every interval and retain implicit holds before departure and after arrival."><input type="checkbox" aria-label="Include whole move and outer holds" checked={whole} onChange={e=>{setWhole(e.target.checked);if(e.target.checked)setSelected(source.map(r=>r.segment.id));}}/></Tooltip> Include whole move and outer holds</span></label>
      <ol className="path-copy-list">{source.map(({segment},i)=><li key={segment.id}><label><Tooltip name="Copy interval" description="Choose one contiguous interval range, including intervening holds."><input type="checkbox" aria-label={`Copy interval ${i+1}`} checked={selected.includes(segment.id)} onChange={e=>{setWhole(false);setSelected(old=>e.target.checked?[...old,segment.id]:old.filter(id=>id!==segment.id));}}/></Tooltip> {i+1}. {segment.kind==='hold'?'Hold':segment.kind==='cubic'?'Curve':'Travel'} · {segment.startCount}–{segment.endCount}</label></li>)}</ol></>}
    {kind==='paste'&&<>{clipboard?<p className="microcopy">Explicit mapping: {clipboard.sourceLabel} / {clipboard.sourceSetName} / counts {clipboard.startCount}–{clipboard.endCount} → {names.length===1?names[0]:'select exactly one destination performer'} / {project.sets[index+1].name}. The source stays unchanged; pasted intervals receive new IDs.</p>:<p className="microcopy">Copy intervals in this production before pasting. Loading another production clears the session clipboard.</p>}
      <div className="form-row">{number('Paste start count',at,setAt)}{number('Paste duration',duration,setDuration)}</div>
      <label className="form-label">Coordinate frame<Tooltip name="Paste coordinate frame" description="Keep field coordinates, translate the start, or rotate and uniformly scale to both destination endpoints."><select aria-label="Paste coordinate frame" value={frame} onChange={e=>setFrame(e.target.value as PasteFrame)}><option value="field">Keep field coordinates</option><option value="translate">Translate from start</option><option value="fit">Fit both endpoints</option></select></Tooltip></label>
      <p className="microcopy">Fit both endpoints rotates and uniformly scales geometry to the destination window; holds stay stationary. Other frames require matching endpoint geometry. All frames preserve destination dots. Counts rescale to the paste duration. Existing intervals in this window are replaced; partial travel cuts are rejected, while boundary holds can split. Nothing clips to the field or trims to fit.</p>
      {clipboard&&clipboard.transition!==move.transition&&<label className="form-label"><span><Tooltip name="Accept destination timing" description="Keep the destination move’s timing profile when it differs from the copied source."><input type="checkbox" aria-label="Accept destination timing" checked={accept} onChange={e=>setAccept(e.target.checked)}/></Tooltip> Use destination {move.transition==='ease'?'eased':'linear'} timing instead of source {clipboard.transition==='ease'?'eased':'linear'} timing</span></label>}
    </>}
    {(error||stale||submitError)&&<p className="field-error" role="alert">{stale?'The production, selection or clipboard changed. Cancel and reopen.':error||submitError}</p>}
    {!error&&<><p role="status" aria-label="Move operation summary">{summary}</p><svg className="path-preview" viewBox={`-7 -8 114 ${project.field.height+16}`} role="img" aria-label="Move operation field preview"><FieldDrawing project={candidate} positions={after} selectedIds={ids} showLabels={false}/>{ids.map(id=><g key={id}><path className="path-original" d={movementSvg(project.sets[index].positions[id],project.sets[index+1].positions[id],move.paths[id])}/><path className="path-proposed" d={movementSvg(candidate.sets[index].positions[id],candidate.sets[index+1].positions[id],nextMove.paths[id])}/><circle className="path-original" cx={before[id].x} cy={before[id].y} r="1.4"/></g>)}</svg>
      <label className="form-label">Preview progress · {progress}%<Tooltip name="Move operation preview progress" description="Compare the same fraction of the saved and proposed move without changing the production."><input type="range" aria-label="Move operation preview progress" value={progress} min={0} max={100} step={1} onChange={e=>setProgress(Number(e.target.value))}/></Tooltip></label><p className="microcopy">Saved count {oldCount.toFixed(3)} → proposed count {newCount.toFixed(3)}. Dashed paths/circles: saved. Solid paths/rings: proposed. Review adjacent moves after endpoint changes. Detailed-path analysis remains unavailable.</p></>}
    <p className="microcopy">Apply is one named undo action. Cancel/Escape preserves the production. Detailed splits and timeline rewiring remain guarded; these operations never silently flatten custom movement.</p>
  </div><div className="modal-actions"><HelpButton title="Cancel move operation" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title={kind==='copy'?'Copy movement interval range':'Apply move operation'} description="Recheck the reviewed context before copying or applying the complete operation." disabled={!!error||stale||kind==='resize'&&Number(counts)===move.counts} disabledReason={error||'Change the operation or cancel and reopen stale context.'} className="button primary" onClick={apply}>{kind==='copy'?'Copy interval range':'Apply · one undo'}</HelpButton></div></Modal>;
}
