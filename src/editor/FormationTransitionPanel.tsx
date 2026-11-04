import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import { StaticFieldMarkings } from '../components/Field2D';
import { fieldViewTransform } from '../components/fieldOrientation';
import { sampleProject, setStartCount } from '../domain';
import { movementSvg, sampleMovement } from '../movementPaths';
import { transitionInput } from '../analysis/input';
import type { TransitionComparison, TransitionReviewMetrics } from '../transitionComparison';
import { beginFormationTransition, formationTransitionCurrent, formationTransitionPlan, savedTransitionPath, transitionMapping } from './formationTransition';
import type { FormationTransitionReview, TransitionPathPolicy } from './formationTransition';
import { newScheduleRow, pathFromRows, scheduleRows } from './movementScheduleEditing';
import type { ScheduleRow } from './movementScheduleEditing';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';
import './paths.css';
import './formationTransition.css';

export function FormationTransitionPanel({controller:c}:{controller:EditorController}) {
  const [initial]=useState(()=>{const s=c.store.getState();return {project:s.project.present,review:beginFormationTransition(s)};});
  const {project}=initial,index=project.moves.findIndex(m=>m.id===initial.review.moveId),move=project.moves[index],start=setStartCount(project,index);
  const [review,setReview]=useState(initial.review),[rows,setRows]=useState<Record<string,ScheduleRow[]>>({});
  const [tab,setTab]=useState<'setup'|'preview'|'mapping'>('setup'),[personId,setPersonId]=useState(initial.review.ids[0]),[count,setCount]=useState(move.counts/2);
  const [showPaths,setShowPaths]=useState(true),[showOriginal,setShowOriginal]=useState(true),[inputPending,setInputPending]=useState(false),[submitError,setSubmitError]=useState(''),[retry,setRetry]=useState(0);
  const inputDrafts=useRef(new Set<string>());
  const draft=useCallback((pending:boolean,id:string)=>{pending?inputDrafts.current.add(id):inputDrafts.current.delete(id);setInputPending(inputDrafts.current.size>0);c.setPendingDraft(pending,id);},[c.setPendingDraft]);
  const dirty=JSON.stringify(review)!==JSON.stringify(initial.review)||Object.keys(rows).length>0;
  useEffect(()=>{c.setPendingDraft(dirty,'formation-transition');return ()=>c.setPendingDraft(false,'formation-transition');},[dirty,c.setPendingDraft]);
  const state=c.store.getState(),stale=!formationTransitionCurrent({...state,ui:{...state.ui,pendingDraft:false}},initial.review);
  const evaluated=useMemo(()=>{
    try {
      const request:FormationTransitionReview={...review,mapping:transitionMapping(project,index,review.sourceId,review.destinationId,review.ids,review.order),
        policies:Object.fromEntries(review.ids.map(id=>{const p=review.policies[id];return [id,p.mode==='custom'?{mode:'custom',path:pathFromRows(rows[id]??[])}:p];}))};
      return {request,plan:formationTransitionPlan(project,request),error:''};
    }catch(error){return {request:null,plan:null,error:(error as Error).message};}
  },[project,index,review,rows]);
  const {plan,request}=evaluated,fingerprint=request?JSON.stringify(request):'';
  const [checks,setChecks]=useState<{fingerprint:string;status:'pending'|'ready'|'error';result?:TransitionComparison;error?:string}>({fingerprint:'',status:'pending'});
  useEffect(()=>{
    if(!plan||stale)return;
    let active=true,worker:Worker|undefined,watchdog:ReturnType<typeof setTimeout>|undefined;
    setChecks({fingerprint,status:'pending'});
    const fail=(message:string)=>{if(active){worker?.terminate();clearTimeout(watchdog);setChecks({fingerprint,status:'error',error:message});}};
    const scheduled=setTimeout(()=>{
      try{
        worker=new Worker(new URL('../formationTransition.worker.ts',import.meta.url),{type:'module'});
        worker.onmessage=({data}:{data:{generation:number;result?:TransitionComparison;error?:string}})=>{
          if(!active||data.generation!==1)return;
          if(data.error){fail(data.error);return;}
          if(data.result){clearTimeout(watchdog);worker?.terminate();setChecks({fingerprint,status:'ready',result:data.result});}
        };
        worker.onerror=worker.onmessageerror=()=>fail('Movement comparison is unavailable. Retry the checks or cancel this review.');
        watchdog=setTimeout(()=>fail('Movement comparison timed out. Retry with fewer members or simpler paths.'),30000);
        worker.postMessage({generation:1,current:transitionInput(project,index+1,review.epoch),proposed:transitionInput(plan.project,index+1,review.epoch),ids:review.ids});
      }catch{fail('Movement comparison could not start. Retry the checks or cancel this review.');}
    },100);
    return ()=>{active=false;clearTimeout(scheduled);clearTimeout(watchdog);worker?.terminate();};
  },[fingerprint,retry,stale]);
  const ready=!!plan&&!stale&&checks.fingerprint===fingerprint&&checks.status==='ready',comparison=ready?checks.result:undefined;
  const source=project.sets[index].liveFormations?.find(f=>f.id===review.sourceId),destination=project.sets[index+1].liveFormations?.find(f=>f.id===review.destinationId);
  const selected=new Set(review.ids),person=project.performers.find(p=>p.id===personId)!,policy=review.policies[personId];
  const currentPositions=sampleProject(project,start+count).positions,positions=plan?sampleProject(plan.project,start+count).positions:currentPositions;
  function update(patch:Partial<FormationTransitionReview>){setSubmitError('');setReview(old=>({...old,...patch}));}
  function mode(value:TransitionPathPolicy['mode']) {
    if(value==='custom'&&!rows[personId])setRows(old=>({...old,[personId]:scheduleRows(plan?.project??project,index,personId)}));
    update({policies:{...review.policies,[personId]:value==='custom'?{mode:'custom',path:null}:{mode:value}}});
  }
  function close(){for(const id of inputDrafts.current)c.setPendingDraft(false,id);inputDrafts.current.clear();c.setPendingDraft(false,'formation-transition');c.dispatch('transition.cancel');}
  function apply(){
    if(!request||!ready||inputPending||!plan?.changed)return;
    c.setPendingDraft(false,'formation-transition');
    if(!c.dispatch('transition.apply',request)){c.setPendingDraft(dirty,'formation-transition');setSubmitError(c.store.getState().ui.toast||'Cancel and reopen the current transition.');}
  }
  function metric(title:string,m:TransitionReviewMetrics){return <div className="transition-metric"><strong>{title}</strong><span>Total {m.travel.toFixed(2)} yd · longest member {m.longestTravel.toFixed(2)} yd</span><span>Peak {(Math.floor(m.demand.lower*1000)/1000).toFixed(3)}–{(Math.ceil(m.demand.upper*1000)/1000).toFixed(3)} yd/count{m.demand.converged?'':' · unconverged bound'}</span><span>All-cast spacing/crossing flags: {m.spacing} · stride: {m.stride}{m.possible?` · ${m.possible} possible`:''}</span></div>;}
  const customRows=rows[personId]??[],lastTravel=customRows.reduce((last,r,i)=>r.kind==='hold'?last:i,-1);
  function rowField(row:ScheduleRow,i:number,key:keyof ScheduleRow,label:string,max:number){return <label className="form-label">{label}<input aria-label={`Override interval ${i+1} ${label}`} type="number" min={0} max={max} step={.1} value={row[key]} onChange={e=>setRows(old=>({...old,[personId]:old[personId].map(r=>r.id===row.id?{...r,[key]:e.target.value}:r)}))}/></label>;}
  return <Modal title="Formation transition" wide className="formation-transition-panel" onClose={close}>
    <p className="transition-intro">{project.sets[index].name} → {project.sets[index+1].name} · {review.ids.length} selected · {move.counts} counts · {move.tempo} base BPM · {move.transition==='ease'?'ease in/out':'linear timing'}</p>
    <div className="transition-tabs" role="group" aria-label="Transition review pages">{(['setup','preview','mapping'] as const).map(value=><HelpButton key={value} title={`Transition ${value}`} aria-pressed={tab===value} className={tab===value?'button primary':'button subtle'} disabled={inputPending} disabledReason="Finish or cancel the numeric entry first." onClick={()=>setTab(value)}>{value==='setup'?'Endpoints and controls':value==='preview'?'Movement preview':'Mapping and overrides'}</HelpButton>)}</div>
    <div className="transition-body">
      {tab==='setup'&&<>
        <div className="transition-grid">{(['source','destination'] as const).map((side,i)=><label className="form-label" key={side}>{side==='source'?'Source formation':'Destination formation'}<select aria-label={`Transition ${side} formation`} value={side==='source'?review.sourceId:review.destinationId} disabled={inputPending} onChange={e=>update(side==='source'?{sourceId:e.target.value}:{destinationId:e.target.value})}><option value="">Choose an editable formation</option>{project.sets[index+i].liveFormations?.map(f=><option key={f.id} value={f.id}>{f.name} · {f.kind} · {f.members.length} members</option>)}</select></label>)}</div>
        <p className="microcopy">Both forms keep their geometry, slots, pins and role/order restrictions. Member identities follow their saved source and destination slots. To change assignment, cancel and use Optimize assignment on the destination form first.</p>
        <div className="transition-grid"><label className="form-label">Group travel<select aria-label="Transition group travel" value={review.controls.kind} disabled={inputPending} onChange={e=>update({controls:{...review.controls,kind:e.target.value as 'line'|'cubic'}})}><option value="line">Straight travel</option><option value="cubic">Curved travel</option></select></label><NumberField label="Transition bend · yd" value={review.controls.bend} min={-100} max={100} step={.25} disabled={review.controls.kind==='line'} onDraftChange={draft} onChange={bend=>update({controls:{...review.controls,bend}})}/>
          <NumberField label="Group departure count" value={review.controls.departure} min={0} max={move.counts} step={.25} onDraftChange={draft} onChange={departure=>update({controls:{...review.controls,departure}})}/><NumberField label="Group arrival count" value={review.controls.arrival} min={0} max={move.counts} step={.25} onDraftChange={draft} onChange={arrival=>update({controls:{...review.controls,arrival}})}/>
          <NumberField label="Member stagger · counts" value={review.controls.stagger} min={0} max={move.counts} step={.25} onDraftChange={draft} onChange={stagger=>update({controls:{...review.controls,stagger}})}/><label className="form-label">Stagger order<select aria-label="Transition stagger order" value={review.order} disabled={inputPending} onChange={e=>update({order:e.target.value as 'source'|'destination'})}><option value="source">Source slot order</option><option value="destination">Destination slot order</option></select></label>
        </div>
        <p className="microcopy">Bend offsets both curve controls perpendicular to each member’s travel. Positive bends left along the source-to-destination direction. Stagger adds a delay by the shown selected-member rank; protected paths keep their own timing. Holds before departure and after arrival are implicit. Nothing is clipped to the field or move duration.</p>
        <p className="section-description">{plan?`${plan.controlled} group-controlled · ${plan.preserved} preserved · ${plan.custom} individual overrides. Last group arrival ${plan.lastArrival.toFixed(2)}.`:'Prepare editable forms on both adjacent sets. Saved parametric templates can be applied with Keep editable on this set.'}</p>
        <HelpButton title="Review transition movement" className="button subtle" disabled={inputPending||!plan} onClick={()=>setTab('preview')}>Review movement and checks</HelpButton>
      </>}
      {tab==='mapping'&&<>
        <p className="microcopy">{source?.name??'Source'} → {destination?.name??'Destination'}. The mapping is fixed by performer identity. Saved paths are protected by default, including after reopening this review. Group controls replace a protected path only when you choose them for that member.</p>
        <div className="transition-mapping"><table aria-label="Transition member mapping"><thead><tr><th>Member</th><th>Source slot</th><th>Destination slot</th><th>Path choice</th><th>Pins</th></tr></thead><tbody>{plan?.mapping.map(m=><tr key={m.performerId}><td>{project.performers.find(p=>p.id===m.performerId)?.label}</td><td>{m.sourceSlot+1}</td><td>{m.destinationSlot+1}</td><td>{review.policies[m.performerId].mode}</td><td>{[source?.assignmentConstraints?.pins.some(p=>p.performerId===m.performerId)||source?.scatter?.pinnedSlots.includes(m.sourceSlot)?'source':'',destination?.assignmentConstraints?.pins.some(p=>p.performerId===m.performerId)||destination?.scatter?.pinnedSlots.includes(m.destinationSlot)?'destination':''].filter(Boolean).join(', ')||'—'}</td></tr>)}</tbody></table></div>
        <div className="transition-grid"><label className="form-label">Transition member<select aria-label="Transition member" value={personId} disabled={inputPending} onChange={e=>setPersonId(e.target.value)}>{review.ids.map(id=><option key={id} value={id}>{project.performers.find(p=>p.id===id)?.label}</option>)}</select></label><label className="form-label">Member path<select aria-label="Transition member path" value={policy.mode} disabled={inputPending} onChange={e=>mode(e.target.value as TransitionPathPolicy['mode'])}><option value="preserve">Preserve saved travel</option><option value="group">Use group controls · replaces saved travel</option><option value="custom">Individual override</option></select></label></div>
        <p className="microcopy">{person.label}: {savedTransitionPath(project,index,personId)?'has an authored path':'uses default straight travel'}. Counts and tempo of the move stay fixed. Edit one member’s intervals below without changing the others.</p>
        {policy.mode==='custom'&&<>
          <ol className="schedule-rows">{customRows.map((row,i)=><li key={row.id}><div className="schedule-row-header"><strong>Override interval {i+1}</strong><select aria-label={`Override interval ${i+1} kind`} value={row.kind} onChange={e=>setRows(old=>({...old,[personId]:old[personId].map(r=>r.id===row.id?{...r,kind:e.target.value as ScheduleRow['kind']}:r)}))}><option value="line">Travel · straight</option><option value="cubic">Travel · curve</option><option value="hold">Hold</option></select><HelpButton title={`Remove override interval ${i+1}`} className="button subtle" onClick={()=>setRows(old=>({...old,[personId]:old[personId].filter(r=>r.id!==row.id)}))}>Remove</HelpButton></div>
            <div className="transition-grid">{rowField(row,i,'start','Departure count',move.counts)}{rowField(row,i,'end','Arrival count',move.counts)}{row.kind!=='hold'&&i!==lastTravel&&<>{rowField(row,i,'x','Arrival X',project.field.width)}{rowField(row,i,'y','Arrival Y',project.field.height)}</>}{row.kind==='cubic'&&<>{rowField(row,i,'c1x','Control 1 X',project.field.width)}{rowField(row,i,'c1y','Control 1 Y',project.field.height)}{rowField(row,i,'c2x','Control 2 X',project.field.width)}{rowField(row,i,'c2y','Control 2 Y',project.field.height)}</>}</div>
          </li>)}</ol>
          {!customRows.length&&<p className="microcopy">This override uses default straight travel for the whole move.</p>}
          <HelpButton title="Add transition override interval" className="button subtle" disabled={customRows.length>=32} onClick={()=>setRows(old=>({...old,[personId]:[...(old[personId]??[]),newScheduleRow(project.sets[index].positions[personId],project.sets[index+1].positions[personId],move.counts,old[personId]?.at(-1)?.end??'0')]}))}>Add interval</HelpButton>
        </>}
      </>}
      {tab==='preview'&&<>
        {comparison&&<div className="transition-metrics" aria-label="Transition movement comparison">{metric('Current movement',comparison.current)}{metric('Proposed movement',comparison.proposed)}</div>}
        <div className="transition-preview-controls"><NumberField label="Transition preview count" value={count} min={0} max={move.counts} step={.25} onDraftChange={draft} onChange={setCount}/><label className="form-label">Scrub the move<input aria-label="Transition count slider" type="range" min={0} max={move.counts} step={.01} value={count} onChange={e=>setCount(Number(e.target.value))}/></label></div>
        <div className="transition-preview-toggles"><label className="transition-check"><input aria-label="Show transition paths" type="checkbox" checked={showPaths} onChange={e=>setShowPaths(e.target.checked)}/>Paths</label><label className="transition-check"><input aria-label="Compare original transition" type="checkbox" checked={showOriginal} onChange={e=>setShowOriginal(e.target.checked)}/>Original outlines</label><HelpButton title="Inspect transition midpoint" className="button subtle" disabled={inputPending} onClick={()=>setCount(move.counts/2)}>Midpoint</HelpButton></div>
        <svg className="transition-field" viewBox="-2 -2 104 57.333" role="img" aria-label="Formation transition movement"><g transform={fieldViewTransform(project.field,c.preferences.value.fieldOrientation)}>
          <StaticFieldMarkings width={project.field.width} height={project.field.height} preset={project.field.preset} showGrid={false}/>
          {showPaths&&plan&&review.ids.map(id=><path key={id} data-transition-path={id} d={movementSvg(project.sets[index].positions[id],project.sets[index+1].positions[id],plan.project.moves[index].paths[id])} fill="none" stroke="var(--field-accent)" strokeWidth={id===personId?'.3':'.13'} opacity=".65"/>)}
          {showOriginal&&review.ids.map(id=><circle key={id} data-transition-original={id} cx={currentPositions[id].x} cy={currentPositions[id].y} r=".65" fill="none" stroke="#fff" strokeWidth=".13"/>)}
          {project.performers.map(p=><circle key={p.id} data-transition-performer={p.id} cx={positions[p.id].x} cy={positions[p.id].y} r={p.id===personId?'.6':selected.has(p.id)?'.42':'.23'} fill={project.sections.find(s=>s.id===p.sectionId)?.color} opacity={selected.has(p.id)?1:.65} stroke={p.id===personId?'var(--field-accent)':'none'} strokeWidth=".25"><title>{p.label}</title></circle>)}
          {review.ids.map(id=><g key={id} fill="none" stroke="#f1d39a" strokeWidth=".12"><circle cx={project.sets[index].positions[id].x} cy={project.sets[index].positions[id].y} r=".35"/><rect x={project.sets[index+1].positions[id].x-.35} y={project.sets[index+1].positions[id].y-.35} width=".7" height=".7"/></g>)}
          {plan&&Array.from({length:Math.min(32,move.counts)+1},(_,i)=>{const tick=i*move.counts/Math.min(32,move.counts),point=sampleMovement(project.sets[index].positions[personId],project.sets[index+1].positions[personId],plan.project.moves[index].paths[personId],tick,move.counts,move.transition);return <circle key={i} data-transition-tick={tick} cx={point.x} cy={point.y} r=".15" fill="#fff"><title>Count {tick.toFixed(2)}</title></circle>;})}
        </g></svg>
        <p className="microcopy">{person.label} at count {count.toFixed(2)}: X {positions[personId].x.toFixed(3)}, Y {positions[personId].y.toFixed(3)} yd. Circles/squares mark the fixed source/destination slots. Dots and ticks use playback’s evaluator, including easing and holds. Flags cover the full cast; travel/demand cover selected members.</p>
        {!!comparison?.issues.length&&<details><summary>Review proposed findings · {comparison.issueCount}</summary><ul className="transition-findings">{comparison.issues.slice(0,100).map((issue,i)=><li key={i}><HelpButton title={`Inspect transition finding ${i+1}`} className="button subtle" disabled={inputPending} onClick={()=>setCount(Math.max(0,Math.min(move.counts,(issue.atCount??start)-start)))}>{issue.message}</HelpButton></li>)}</ul>{comparison.issueCount>100&&<p className="microcopy">Showing the first 100 findings. All findings contribute to the counts; use Problems after applying for full-show review.</p>}</details>}
      </>}
    </div>
    <div className="modal-actions">
      {(stale||evaluated.error||submitError)&&<p className="field-error" role="alert">{stale?'The production, move or selection changed. Cancel and reopen this review.':evaluated.error||submitError}</p>}
      {!!plan&&!stale&&(!ready)&&<p role={checks.fingerprint===fingerprint&&checks.status==='error'?'alert':'status'} data-transition-check-status={checks.fingerprint===fingerprint?checks.status:'pending'}>{checks.fingerprint===fingerprint&&checks.status==='error'?checks.error:'Checking current and proposed movement…'}</p>}
      <HelpButton title="Cancel formation transition" className="button subtle" onClick={close}>Cancel</HelpButton>
      {checks.status==='error'&&<HelpButton title="Retry transition checks" className="button subtle" disabled={inputPending||!plan||stale} onClick={()=>setRetry(n=>n+1)}>Retry movement checks</HelpButton>}
      {ready&&<span className="microcopy" data-transition-check-status="ready">Movement checks ready</span>}
      <HelpButton title="Apply formation transition" command="transition.apply" className="button primary" disabled={stale||!!evaluated.error||inputPending||!ready||!plan?.changed} disabledReason={stale?'Cancel and reopen after the context changed.':evaluated.error||(!plan?.changed?'Change a selected path first.':'Wait for movement checks and finish numeric entry.')} onClick={apply}>Apply transition · one undo</HelpButton>
    </div>
  </Modal>;
}
