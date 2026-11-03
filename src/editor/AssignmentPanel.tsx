import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import { StaticFieldMarkings } from '../components/Field2D';
import { assignmentRole, emptyAssignmentConstraints } from '../assignmentConstraints';
import { assignedChecks, assignmentProblem } from '../assignmentOptimization';
import type { AssignmentAlternative, AssignmentComparison } from '../assignmentOptimization';
import type { AssignmentConstraints } from '../types';
import { movementSvg, sampleMovement } from '../movementPaths';
import { uid } from '../domain';
import { assignmentReviewCurrent, defaultAssignmentConstraints } from './assignmentReview';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';
import './assignment.css';

const names={current:'Current mapping',distance:'Shortest total travel',balanced:'Balanced member travel'};
export function AssignmentPanel({controller:c}:{controller:EditorController}) {
  const [initial]=useState(()=>{const state=c.store.getState();return {project:state.project.present,session:structuredClone(state.ui.formationPreview!),revision:state.project.revision,epoch:state.ui.projectEpoch,signature:JSON.stringify(state.ui.formationPreview),constraints:defaultAssignmentConstraints(state)};});
  const problem=useMemo(()=>assignmentProblem(initial.project,initial.session,initial.epoch),[initial]);
  const [constraints,setConstraints]=useState(initial.constraints),[result,setResult]=useState<AssignmentComparison|null>(null),[running,setRunning]=useState(false),[error,setError]=useState('');
  const [personId,setPersonId]=useState(problem.slots[0].ownerId),[slot,setSlot]=useState(problem.slots[0].slot),[orderedSection,setOrderedSection]=useState(initial.project.sections[0].id);
  const [choice,setChoice]=useState<AssignmentAlternative['objective']>('distance'),[moveIndex,setMoveIndex]=useState(0),[count,setCount]=useState(0),[paths,setPaths]=useState(true);
  const alternativesRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(result)alternativesRef.current?.scrollIntoView({block:"start"});},[result]);
  const worker=useRef<Worker|null>(null),generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const stop=()=>{generation.current++;worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;};
  useEffect(()=>()=>stop(),[]);
  const state=c.store.getState();
  const stale=!assignmentReviewCurrent({...state,ui:{...state.ui,pendingDraft:false}},initial);
  const draft=(next:AssignmentConstraints)=>{stop();setRunning(false);setResult(null);setError('');setConstraints(next);};
  function compute() {
    stop();setResult(null);setError('');setRunning(true);const current=++generation.current;
    try {
      const instance=new Worker(new URL('../assignment.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
      const fail=(message:string)=>{if(current!==generation.current)return;stop();setRunning(false);setError(message);};
      instance.onmessage=({data}:{data:{generation:number;error?:string;result?:AssignmentComparison}})=>{
        if(current!==generation.current||data.generation!==current)return;
        if(data.error){fail(data.error);return;}
        if(data.result){stop();setRunning(false);setResult(data.result);setChoice(data.result.proposals.length?'distance':'current');}
      };
      instance.onerror=instance.onmessageerror=()=>fail('Assignment comparison is unavailable. Retry, or cancel to keep the current preview.');
      timer.current=setTimeout(()=>fail('Assignment comparison timed out. Try a smaller selection or simpler movement paths. No proposal was applied.'),30000);
      instance.postMessage({generation:current,problem,constraints});
    }catch{stop();setRunning(false);setError('Assignment comparison could not start. Retry, or cancel to keep the current preview.');}
  }
  const alternatives=result?[result.current,...result.proposals]:[],selected=alternatives.find(p=>p.objective===choice);
  const owner=problem.slots.find(s=>s.slot===slot)!,person=problem.performers.find(p=>p.id===personId)!;
  const pinned=constraints.pins.find(p=>p.performerId===personId),forbidden=constraints.forbidden.some(p=>p.performerId===personId&&p.slot===slot),forced=problem.forcedPins.find(p=>p.performerId===personId);
  const checks=useMemo(()=>selected?assignedChecks(problem,selected.order):problem.checks,[problem,selected]);
  const check=checks[moveIndex]??checks[0],localCount=Math.min(count,check?.input.counts??0);
  const displayed=selected?.order??problem.slots.map(s=>s.ownerId),points=new Map(displayed.map((id,i)=>[id,problem.slots[i].point]));
  const roleText=assignmentRole(constraints,personId)??'',slotRole=constraints.roleSlots.find(s=>s.slot===slot)?.role??'';
  const pairPin=(enabled:boolean)=>draft({...constraints,pins:[...constraints.pins.filter(p=>p.performerId!==personId),...(enabled?[{performerId:personId,slot}]:[])]});
  const role=(value:string)=>{const roles={...constraints.roles};if(value)roles[personId]=value;else delete roles[personId];draft({...constraints,roles});};
  const addGroup=()=>{const members=problem.slots.filter(s=>problem.performers.find(p=>p.id===s.ownerId)!.sectionId===orderedSection);if(members.length<2){setError('Choose a section with at least two selected performers.');return;}
    draft({...constraints,orderedGroups:[...constraints.orderedGroups,{id:uid(),name:initial.project.sections.find(s=>s.id===orderedSection)!.name+' order',performerIds:members.map(s=>s.ownerId),slots:members.map(s=>s.slot)}]});};
  const close=()=>{stop();c.setDialog(null);};
  return <Modal title="Optimize assignment" wide className="assignment-panel" onClose={close}>
    <div className="assignment-body">
      <p className="section-description">{problem.performers.length} selected members · {problem.slots.length} occupied slots · {problem.checks.length?'available adjacent moves':'placement distances only; no move timing'}. Proposals preserve the cast and destination geometry.</p>
      <p className="microcopy">Shortest total minimizes summed path lengths. Balanced minimizes squared member travel and can increase the total. Compare movement flags and peak demand before choosing. Ordered groups fix the shown member sequence to the shown slot sequence.</p>
      <div className="assignment-controls">
        <section aria-label="Member and slot restrictions">
          <h3>Member and destination</h3>
          <label className="form-label">Assignment member<select aria-label="Assignment member" value={personId} disabled={c.pendingDraft} onChange={e=>{setPersonId(e.target.value);setSlot(problem.slots.find(s=>s.ownerId===e.target.value)!.slot);}}>{problem.performers.map(p=><option key={p.id} value={p.id}>{p.label} · {initial.project.sections.find(s=>s.id===p.sectionId)?.name}</option>)}</select></label>
          <label className="form-label">Destination slot<select aria-label="Destination slot" value={slot} disabled={c.pendingDraft} onChange={e=>setSlot(Number(e.target.value))}>{problem.slots.map(s=><option key={s.slot} value={s.slot}>Slot {s.slot+1} · current {initial.project.performers.find(p=>p.id===s.ownerId)?.label}</option>)}</select></label>
          <p className="microcopy">Slot {slot+1}: {owner.point.x.toFixed(2)}, {owner.point.y.toFixed(2)} yd. Current member: {initial.project.performers.find(p=>p.id===owner.ownerId)?.label}.</p>
          <label className="assignment-check"><input aria-label="Pin member to destination" type="checkbox" checked={!!pinned||!!forced} disabled={c.pendingDraft||!!forced} onChange={e=>pairPin(e.target.checked)}/>Pin {person.label}{pinned?` to slot ${pinned.slot+1}`:` to slot ${slot+1}`}</label>
          {pinned&&pinned.slot!==slot&&<HelpButton title="Move assignment pin" className="button subtle" disabled={c.pendingDraft} onClick={()=>pairPin(true)}>Move pin to this slot</HelpButton>}
          {forced&&<p className="microcopy">Scatter pin fixes this member to slot {forced.slot+1}. Change that pin in the scatter editor.</p>}
          <label className="assignment-check"><input aria-label="Prohibit member destination" type="checkbox" checked={forbidden} disabled={c.pendingDraft} onChange={e=>draft({...constraints,forbidden:[...constraints.forbidden.filter(p=>p.performerId!==personId||p.slot!==slot),...(e.target.checked?[{performerId:personId,slot}]:[])]})}/>Prohibit {person.label} → slot {slot+1}</label>
          <label className="form-label">Slot section<select aria-label="Slot section" value={constraints.sectionSlots.find(r=>r.slot===slot)?.sectionId??''} disabled={c.pendingDraft} onChange={e=>draft({...constraints,sectionSlots:[...constraints.sectionSlots.filter(s=>s.slot!==slot),...(e.target.value?[{slot,sectionId:e.target.value}]:[])]})}><option value="">Any section</option>{initial.project.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <div className="form-row"><HelpButton title="Preserve current section slots" className="button subtle" disabled={c.pendingDraft} onClick={()=>draft({...constraints,sectionSlots:problem.slots.map(s=>({slot:s.slot,sectionId:problem.performers.find(p=>p.id===s.ownerId)!.sectionId}))})}>Keep section slots</HelpButton><HelpButton title="Clear section restrictions" className="button subtle" disabled={c.pendingDraft} onClick={()=>draft({...constraints,sectionSlots:[]})}>Clear section rules</HelpButton></div>
        </section>
        <section aria-label="Roles and ordered groups">
          <h3>Roles and order</h3>
          <p className="microcopy">Enter an instrument or role tag for this assignment. Blank means unknown. Roles are never inferred from names or section labels.</p>
          <label className="form-label">Member role tag<input aria-label="Member role tag" maxLength={40} value={roleText} disabled={c.pendingDraft} onChange={e=>role(e.target.value)}/></label>
          <label className="form-label">Slot required role<input aria-label="Slot required role" maxLength={40} value={slotRole} disabled={c.pendingDraft} onChange={e=>draft({...constraints,roleSlots:[...constraints.roleSlots.filter(r=>r.slot!==slot),...(e.target.value?[{slot,role:e.target.value}]:[])]})}/></label>
          <label className="assignment-check"><input aria-label="Allow unknown roles in restricted slots" type="checkbox" checked={constraints.unknownRoles==='allow'} disabled={c.pendingDraft} onChange={e=>draft({...constraints,unknownRoles:e.target.checked?'allow':'reject'})}/>Allow unknown roles in restricted slots</label>
          <label className="form-label">Ordered section<select aria-label="Ordered section" value={orderedSection} disabled={c.pendingDraft} onChange={e=>setOrderedSection(e.target.value)}>{initial.project.sections.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <HelpButton title="Add ordered section group" className="button subtle" disabled={c.pendingDraft||constraints.orderedGroups.length>=64} onClick={addGroup}>Keep this section’s current order</HelpButton>
          {constraints.orderedGroups.map(group=><div className="assignment-group" key={group.id}><strong>{group.name} · {group.performerIds.length} members</strong><p className="microcopy">Slots {group.slots.map(s=>s+1).join(', ')}. Moving the start chooses a contiguous band of occupied slots.</p><NumberField label={`Start slot for ${group.name}`} value={Math.max(0,problem.slots.findIndex(s=>s.slot===group.slots[0]))+1} min={1} max={problem.slots.length-group.slots.length+1} integer step={1} onDraftChange={c.setPendingDraft} onChange={start=>draft({...constraints,orderedGroups:constraints.orderedGroups.map(g=>g.id===group.id?{...g,slots:problem.slots.slice(start-1,start-1+g.performerIds.length).map(s=>s.slot)}:g)})}/><HelpButton title={`Remove ${group.name}`} className="button subtle" disabled={c.pendingDraft} onClick={()=>draft({...constraints,orderedGroups:constraints.orderedGroups.filter(g=>g.id!==group.id)})}>Remove order rule</HelpButton></div>)}
        </section>
      </div>
      <div className="form-row"><HelpButton title="Clear assignment constraints" className="button subtle" disabled={c.pendingDraft} onClick={()=>draft(emptyAssignmentConstraints())}>Clear all constraints</HelpButton><span className="microcopy">{constraints.pins.length} pins · {constraints.forbidden.length} prohibited pairs · {constraints.sectionSlots.length} section slots · {constraints.roleSlots.length} role slots · {constraints.orderedGroups.length} ordered groups</span></div>
      {alternatives.length>0&&<div ref={alternativesRef} className="assignment-alternatives" role="group" aria-label="Assignment alternatives">{alternatives.map(a=><HelpButton key={a.objective} title={names[a.objective]} className={`assignment-card ${choice===a.objective?'active':''}`} aria-pressed={choice===a.objective} disabled={!a.eligible||c.pendingDraft} disabledReason="This mapping violates the draft constraints." onClick={()=>{setChoice(a.objective);setCount(0);}}><strong>{names[a.objective]}</strong><span>Total {a.metrics.travel.toFixed(2)} yd · longest member {a.metrics.longestTravel.toFixed(2)} yd</span><span>Peak demand {a.metrics.demand?`${(Math.floor(a.metrics.demand.lower*1000)/1000).toFixed(3)}–${(Math.ceil(a.metrics.demand.upper*1000)/1000).toFixed(3)} yd/count${a.metrics.demand.converged?'':' · unconverged bound'}`:'n/a'}</span><span>All-cast spacing/crossing flags: {a.metrics.flags?.spacing??'n/a'} · stride flags: {a.metrics.flags?.stride??'n/a'}{a.metrics.flags?.possible?` · ${a.metrics.flags.possible} possible`:''}</span>{!a.eligible&&<span>Current mapping violates draft constraints</span>}</HelpButton>)}</div>}
      <section aria-label="Assignment movement preview" className="assignment-preview">
        <div className="form-row">{check&&<><label className="form-label">Preview move<select aria-label="Assignment preview move" value={moveIndex} onChange={e=>{setMoveIndex(Number(e.target.value));setCount(0);}}>{checks.map((ch,i)=><option key={ch.side} value={i}>{ch.side==='incoming'?'Incoming':'Outgoing'} · {ch.input.counts} counts</option>)}</select></label><NumberField label="Assignment preview count" value={localCount} min={0} max={check.input.counts} step={.1} onDraftChange={c.setPendingDraft} onChange={setCount}/></>}<label className="assignment-check"><input aria-label="Show assignment paths" type="checkbox" checked={paths} onChange={e=>setPaths(e.target.checked)}/>Show paths</label></div>
        <svg viewBox="-2 -2 104 57.333" aria-label="Reviewed assignment geometry" role="img"><StaticFieldMarkings width={initial.project.field.width} height={initial.project.field.height} preset={initial.project.field.preset} showGrid={false}/><g fill="none" stroke="var(--field-accent)" strokeWidth=".18" opacity=".65">{paths&&check&&check.input.tracks.filter(t=>points.has(t.id)).map(t=><path key={t.id} data-assignment-path={t.id} d={movementSvg(t.from,t.to,t.path)}/>)}</g>{initial.project.performers.map(person=>{const track=check?.input.tracks.find(t=>t.id===person.id),point=track?sampleMovement(track.from,track.to,track.path,localCount,check!.input.counts,check!.input.transition):points.get(person.id)??initial.project.sets.find(s=>s.id===initial.session.setId)!.positions[person.id];return <circle key={person.id} data-assignment-performer={person.id} cx={point.x} cy={point.y} r={person.id===personId ? .7 : points.has(person.id) ? .45 : .25} fill={points.has(person.id)?'var(--field-accent)':'#9db7a5'} stroke={person.id===personId?'#fff':'none'} strokeWidth=".2"><title>{person.label}</title></circle>;})}<g fill="none" stroke="#f1d39a" strokeWidth=".15">{problem.slots.map(s=><rect key={s.slot} data-assignment-slot={s.slot} x={s.point.x-.45} y={s.point.y-.45} width=".9" height=".9"/>)}</g></svg>
        <p className="microcopy">Squares are the unchanged destination slots. The count preview uses playback’s evaluator, including curves and holds. Flag counts cover all performers on available adjacent moves; distance/demand metrics cover the selected members. A shorter route does not guarantee fewer flags.</p>
      </section>
    </div>
    <div className="modal-actions">
      {(stale||error||result?.infeasible)&&<p className="field-error" role="alert">{stale?'The production or preview changed. Cancel and reopen Optimize assignment.':error||result?.infeasible}</p>}
      <p className="microcopy">Use proposal returns to the formation preview. Apply formation commits one undo step. Constraints stay with an editable formation; member/assignment changes require reviewing or clearing them.</p>
      <HelpButton title="Cancel assignment review" className="button subtle" onClick={close}>Cancel</HelpButton>
      {running?<HelpButton title="Cancel assignment calculation" className="button subtle" onClick={()=>{stop();setRunning(false);setError('Comparison canceled. The production and formation preview are unchanged.');}}>Cancel calculation</HelpButton>:<HelpButton title="Compute assignment proposals" className="button subtle" disabled={stale||c.pendingDraft} onClick={compute}>Compare proposals</HelpButton>}
      <HelpButton title="Use assignment proposal" command="assignment.accept" className="button primary" disabled={stale||running||c.pendingDraft||!selected?.eligible} disabledReason={stale?'The reviewed production changed.':'Compute and choose an eligible mapping first.'} onClick={()=>{if(selected)c.dispatch('assignment.accept',{revision:initial.revision,epoch:initial.epoch,signature:initial.signature,constraints:result!.constraints,order:selected.order});}}>Use proposal</HelpButton>
      {running&&<span role="status">Comparing assignments and movement checks…</span>}
    </div>
  </Modal>;
}
