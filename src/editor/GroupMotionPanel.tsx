import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { NumberField } from '../components/NumberField';
import { StaticFieldMarkings } from '../components/Field2D';
import { fieldViewTransform } from '../components/fieldOrientation';
import { sampleProject, setStartCount, uid } from '../domain';
import { effectiveMove, groupOwner, groupRoute, memberDistance } from '../groupMotion';
import { movementSvg, sampleMovement } from '../movementPaths';
import { routeSeam, routeSvg } from '../sharedRoutes';
import { transitionInput } from '../analysis/input';
import type { GroupMotion } from '../types';
import type { TransitionComparison, TransitionReviewMetrics } from '../transitionComparison';
import { beginGroupMotion, groupMotionPlan, groupReviewCurrent } from './groupMotionReview';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';
import './formationTransition.css';
import './groupMotion.css';

export function GroupMotionPanel({controller:c}:{controller:EditorController}) {
  const [initial]=useState(()=>{const state=c.store.getState();return {project:state.project.present,review:beginGroupMotion(state,state.ui.groupMotionId)};});
  const {project}=initial,[group,setGroup]=useState(initial.review.group!),[tab,setTab]=useState<'controls'|'members'|'preview'>('controls');
  const sourceIndex=project.moves.findIndex(m=>m.id===initial.review.moveId),sourceMove=project.moves[sourceIndex];
  const [remove,setRemove]=useState(false),[copyMove,setCopyMove]=useState(''),[fitCounts,setFitCounts]=useState(true),[copyId]=useState(uid);
  const [allowOverride,setAllowOverride]=useState(false),[inspect,setInspect]=useState(group.members[0]),[count,setCount]=useState(sourceMove.counts/2),[paths,setPaths]=useState(true),[originals,setOriginals]=useState(true);
  const [inputPending,setInputPending]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  const inputDrafts=useRef(new Set<string>());
  const draft=useCallback((pending:boolean,id:string)=>{pending?inputDrafts.current.add(id):inputDrafts.current.delete(id);setInputPending(inputDrafts.current.size>0);c.setPendingDraft(pending,id);},[c.setPendingDraft]);
  const dirty=remove||!!copyMove||JSON.stringify(group)!==JSON.stringify(initial.review.group);
  useEffect(()=>{c.setPendingDraft(dirty,'group-motion');return ()=>c.setPendingDraft(false,'group-motion');},[dirty,c.setPendingDraft]);
  const state=c.store.getState(),stale=!groupReviewCurrent({...state,ui:{...state.ui,pendingDraft:false}},initial.review);
  const evaluated=useMemo(()=>{
    const request={...initial.review,group:remove?null:group,allowOverride,...(copyMove&&!remove?{copy:{moveId:copyMove,groupId:copyId,fitCounts}}:{})};
    try{return {request,plan:groupMotionPlan(project,request),error:''};}catch(error){return {request,plan:null,error:(error as Error).message};}
  },[project,group,allowOverride,remove,copyMove,copyId,fitCounts,initial]);
  const {plan,request}=evaluated,fingerprint=plan?JSON.stringify(request):'';
  const [checks,setChecks]=useState<{fingerprint:string;status:'pending'|'ready'|'error';result?:TransitionComparison;error?:string}>({fingerprint:'',status:'pending'});
  useEffect(()=>{
    if(!plan||stale)return;let active=true,worker:Worker|undefined,watchdog:ReturnType<typeof setTimeout>|undefined;
    setChecks({fingerprint,status:'pending'});
    const fail=(error:string)=>{if(active){worker?.terminate();clearTimeout(watchdog);setChecks({fingerprint,status:'error',error});}};
    const scheduled=setTimeout(()=>{try{
      worker=new Worker(new URL('../formationTransition.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=({data}:{data:{generation:number;result?:TransitionComparison;error?:string}})=>{if(!active||data.generation!==1)return;if(data.error){fail(data.error);return;}if(data.result){clearTimeout(watchdog);worker?.terminate();setChecks({fingerprint,status:'ready',result:data.result});}};
      worker.onerror=worker.onmessageerror=()=>fail('Group movement checks are unavailable. Retry or cancel.');
      watchdog=setTimeout(()=>fail('Group movement checks timed out. Simplify travel or select fewer members.'),30000);
      worker.postMessage({generation:1,current:transitionInput(project,plan.index+1,initial.review.epoch),proposed:transitionInput(plan.project,plan.index+1,initial.review.epoch),ids:plan.ids});
    }catch{fail('Group movement checks could not start. Retry or cancel.');}},100);
    return ()=>{active=false;clearTimeout(scheduled);clearTimeout(watchdog);worker?.terminate();};
  },[fingerprint,retry,stale]);
  const ready=!!plan&&!stale&&checks.fingerprint===fingerprint&&checks.status==='ready',comparison=ready?checks.result:undefined;
  const index=plan?.index??sourceIndex,move=project.moves[index],previewProject=plan?.project??project,start=setStartCount(project,index),local=Math.min(count,move.counts);
  const selected=new Set(plan?.ids??group.members),personId=group.members.includes(inspect)?inspect:group.members[0],person=project.performers.find(p=>p.id===personId);
  const positions=sampleProject(previewProject,start+local).positions,baseline=sampleProject(project,start+local).positions;
  const route=project.sharedRoutes?.find(r=>r.id===group.routeId),path=personId?effectiveMove(previewProject,index).paths[personId]:undefined;
  function update(patch:Partial<GroupMotion>){setMessage('');setGroup(old=>({...old,...patch}));}
  function close(){for(const id of inputDrafts.current)c.setPendingDraft(false,id);inputDrafts.current.clear();c.setPendingDraft(false,'group-motion');c.dispatch('group.cancel');}
  function apply(){if(!ready||inputPending||!plan?.changed)return;c.setPendingDraft(false,'group-motion');if(!c.dispatch('group.apply',request)){c.setPendingDraft(dirty,'group-motion');setMessage(c.store.getState().ui.toast||'Cancel and reopen the current group review.');}}
  function metric(title:string,m:TransitionReviewMetrics){return <div className="transition-metric"><strong>{title}</strong><span>Total {m.travel.toFixed(2)} yd · longest {m.longestTravel.toFixed(2)} yd</span><span>Peak {(Math.floor(m.demand.lower*1000)/1000).toFixed(3)}–{(Math.ceil(m.demand.upper*1000)/1000).toFixed(3)} yd/count{m.demand.converged?'':' · unconverged'}</span><span>All-cast spacing/crossing: {m.spacing} · stride: {m.stride}{m.possible?` · ${m.possible} possible`:''}</span></div>;}
  function reorder(delta:number){const rank=group.members.indexOf(personId),next=rank+delta;if(rank<0||next<0||next>=group.members.length)return;const members=[...group.members];[members[rank],members[next]]=[members[next],members[rank]];update({members});}
  const shown=plan?.group??group,shownDuration=move.counts-shown.exitCounts-shown.entryCounts;
  const advance=memberDistance(shown,0,Math.max(0,shownDuration))-memberDistance(shown,0,0);
  const history=group.mode==='conveyor'?0:Math.max(0,group.members.length-1)*group.delay,duration=sourceMove.counts-group.exitCounts-group.entryCounts;
  return <Modal title="Group route movement" wide className="formation-transition-panel group-motion-panel" onClose={close}>
    <p className="transition-intro" data-group-review-id={group.id}>{project.sets[index].name} → {project.sets[index+1].name} · {move.counts} counts · {group.members.length} ordered members · {person?.label??'Choose members'}</p>
    <div className="transition-tabs" role="group" aria-label="Group movement review pages">{(['controls','members','preview'] as const).map(value=><HelpButton key={value} title={`Group ${value}`} aria-pressed={tab===value} className={tab===value?'button primary':'button subtle'} disabled={inputPending} onClick={()=>setTab(value)}>{value==='controls'?'Route and timing':value==='members'?'Members and leader':'Movement preview'}</HelpButton>)}</div>
    <div className="transition-body">
      {tab==='controls'&&<>
        <div className="transition-grid"><label className="form-label">Movement name<input aria-label="Group movement name" maxLength={80} value={group.name} onChange={e=>update({name:e.target.value})}/></label><label className="form-label">Shared route<select aria-label="Group route" value={group.routeId} disabled={inputPending} onChange={e=>update({routeId:e.target.value})}><option value="">Choose a saved route</option>{project.sharedRoutes?.map(r=><option key={r.id} value={r.id}>{r.name} · {r.closed?'closed':'open'}</option>)}</select></label>
          <label className="form-label">Travel mode<select aria-label="Group travel mode" value={group.mode} disabled={inputPending} onChange={e=>update({mode:e.target.value as GroupMotion['mode']})}><option value="follow">Follow the leader · count delay</option><option value="countermarch">Counter-march · delayed turns</option><option value="conveyor">Conveyor · distance offsets</option></select></label>
          <NumberField label="Route speed · yd/count" value={group.speed} min={.001} max={100} step={.1} onDraftChange={draft} onChange={speed=>update({speed})}/>
          <NumberField label="Initial route phase · yd" value={group.phase} min={-1000000} max={1000000} step={.1} onDraftChange={draft} onChange={phase=>update({phase})}/>
          <NumberField label="Follower delay · counts" value={group.delay} min={0} max={4096} step={.25} disabled={group.mode==='conveyor'} onDraftChange={draft} onChange={delay=>update({delay})}/>
          <NumberField label="Conveyor interval · yd" value={group.interval} min={.01} max={1000} step={.1} disabled={group.mode!=='conveyor'} onDraftChange={draft} onChange={interval=>update({interval})}/>
          <label className="form-label">Member offset direction<select aria-label="Conveyor offset direction" value={group.offsetDirection} disabled={group.mode!=='conveyor'||inputPending} onChange={e=>update({offsetDirection:Number(e.target.value) as -1|1})}><option value={-1}>Earlier along route (−)</option><option value={1}>Later along route (+)</option></select></label>
          <NumberField label="Entry connector · counts" value={group.entryCounts} min={0} max={sourceMove.counts} step={.25} onDraftChange={draft} onChange={entryCounts=>update({entryCounts})}/>
          <NumberField label="Exit connector · counts" value={group.exitCounts} min={0} max={sourceMove.counts} step={.25} onDraftChange={draft} onChange={exitCounts=>update({exitCounts})}/>
          <label className="form-label">Open-route endpoints<select aria-label="Group endpoint policy" value={group.endpointPolicy} disabled={inputPending} onChange={e=>update({endpointPolicy:e.target.value as 'hold'|'reject'})}><option value="reject">Reject insufficient history/length</option><option value="hold">Hold at route ends · spacing may compress</option></select></label>
        </div>
        {route&&group.mode==='conveyor'&&<p className="microcopy">Route length {groupRoute(route).length.toFixed(3)} yd. {route.closed?`Last-to-first gap ${(groupRoute(route).length-(group.members.length-1)*group.interval).toFixed(3)} yd; it must be at least the chosen interval. Offsets keep their order through direction changes and seams.`:'Open endpoint holds can compress physical intervals; inspect the full-cast findings.'}</p>}
        {route?.closed&&group.mode==='conveyor'&&<HelpButton title="Space conveyor around whole loop" className="button subtle" disabled={inputPending||group.members.length<2} onClick={()=>update({interval:groupRoute(route).length/group.members.length})}>Space evenly around the whole loop</HelpButton>}
        <p className="microcopy">Entry/exit are explicit straight submoves to the unchanged set dots. Zero requires matching route endpoints. Group travel uses linear counts even when the move is eased. Followers evaluate the leader {group.delay} counts earlier per rank; conveyors use signed arc-length offsets. Travel direction does not declare performer facing.</p>
        <fieldset className="group-cues"><legend>Leader direction and stop cues · route-local clock</legend>{group.cues.map((cue,i)=><div className="group-cue" key={i}>
          <label className="form-label">Cue {i+1} clock<input aria-label={`Group cue ${i+1} count`} type="number" min={-history} max={Math.max(0,duration)} step={.25} value={Number.isFinite(cue.count)?cue.count:''} onChange={e=>update({cues:group.cues.map((v,j)=>i===j?{...v,count:e.target.value.trim()?Number(e.target.value):NaN}:v)})}/></label>
          <label className="form-label">Direction<select aria-label={`Group cue ${i+1} direction`} value={cue.direction} onChange={e=>update({cues:group.cues.map((v,j)=>i===j?{...v,direction:Number(e.target.value) as -1|0|1}:v)})}><option value={1}>Forward along route (+)</option><option value={-1}>Reverse along route (−)</option><option value={0}>Stop / hold</option></select></label>
          <HelpButton title={`Remove group cue ${i+1}`} className="button subtle" disabled={group.cues.length===1} onClick={()=>update({cues:group.cues.filter((_,j)=>j!==i)})}>Remove</HelpButton>
        </div>)}<HelpButton title="Add group direction cue" className="button subtle" disabled={group.cues.length>=32} onClick={()=>update({cues:[...group.cues,{count:(group.cues.at(-1)?.count??0)+Math.max(.25,duration/4),direction:-1}]})}>Add direction / stop cue</HelpButton></fieldset>
        <p className="microcopy">Cues increase strictly. The initial direction extends before its first cue; negative clocks explicitly supply follower history (down to −{history.toFixed(2)}). A turn reverses travel immediately at the same point; Counter-march requires both directions. Followers turn later by their delay; conveyor direction changes happen together. Stops hold until the next cue. Closed routes wrap continuously; corner seams retain their corners.</p>
        <label className="transition-check"><input aria-label="Allow group path overrides" type="checkbox" checked={allowOverride} onChange={e=>setAllowOverride(e.target.checked)}/>Allow group travel to override saved individual paths while grouped. Removing a member restores its saved travel.</label>
        {initial.review.existing&&<label className="transition-check"><input aria-label="Remove saved group movement" type="checkbox" checked={remove} onChange={e=>{setRemove(e.target.checked);setCopyMove('');}}/>Remove this group · preview restored individual travel before Apply</label>}
        <div className="transition-grid"><label className="form-label">Copy reviewed group to another move<select aria-label="Copy group to move" value={copyMove} disabled={remove||inputPending} onChange={e=>setCopyMove(e.target.value)}><option value="">Save on this incoming move</option>{project.moves.map((m,i)=>i!==sourceIndex&&<option key={m.id} value={m.id}>Move to {project.sets[i+1].name} · {m.counts} counts</option>)}</select></label>{copyMove&&<label className="transition-check"><input aria-label="Fit copied group counts" type="checkbox" checked={fitCounts} onChange={e=>setFitCounts(e.target.checked)}/>Fit clocks, delays, connectors and speed to destination counts</label>}</div>
        {copyMove&&<p className="microcopy">Copy saves a new group on the destination move; the source stays unchanged. Preview and checks now show that destination. Conflicting membership, endpoints or capacity block acceptance.</p>}
        {!project.sharedRoutes?.length&&<p className="microcopy">Cancel and use Shared routes to draw or place an open or closed route, then return with an explicit selection.</p>}
      </>}
      {tab==='members'&&<>
        <p className="microcopy">Member 1 is the leader/reference member. Reordering changes count-delay rank or conveyor offset rank; identities remain attached to their own endpoint dots. Other groups on this move cannot share a member.</p>
        <label className="form-label">Inspected member<select aria-label="Group member" value={personId??''} disabled={inputPending} onChange={e=>setInspect(e.target.value)}>{group.members.map((id,i)=><option key={id} value={id}>{i+1} · {project.performers.find(p=>p.id===id)?.label}{i===0?' · leader/reference':''}</option>)}</select></label>
        <div className="transition-preview-toggles"><HelpButton title="Move group member earlier" className="button subtle" disabled={inputPending||group.members.indexOf(personId)<=0} onClick={()=>reorder(-1)}>Move earlier</HelpButton><HelpButton title="Move group member later" className="button subtle" disabled={inputPending||group.members.indexOf(personId)<0||group.members.indexOf(personId)>=group.members.length-1} onClick={()=>reorder(1)}>Move later</HelpButton></div>
        <div className="group-member-list">{project.performers.map(p=>{const owner=groupOwner(sourceMove,p.id),other=!!owner&&owner.id!==initial.review.groupId;return <label key={p.id} className="transition-check"><input aria-label={`Group member ${p.label}`} type="checkbox" checked={group.members.includes(p.id)} disabled={other||inputPending} onChange={e=>update({members:e.target.checked?[...group.members,p.id]:group.members.filter(id=>id!==p.id)})}/>{p.label}{group.members[0]===p.id?' · leader/reference':''}{other?` · uses ${owner!.name}`:''}</label>;})}</div>
      </>}
      {tab==='preview'&&<>
        {comparison&&<div className="transition-metrics">{metric('Current movement',comparison.current)}{metric('Proposed movement',comparison.proposed)}</div>}
        <div className="transition-preview-controls"><NumberField label="Group preview count" value={local} min={0} max={move.counts} step={.25} onDraftChange={draft} onChange={setCount}/><label className="form-label">Scrub incoming move<input aria-label="Group count slider" type="range" min={0} max={move.counts} step={.01} value={local} onChange={e=>setCount(Number(e.target.value))}/></label></div>
        <div className="transition-preview-toggles"><label className="transition-check"><input aria-label="Show inspected group path" type="checkbox" checked={paths} onChange={e=>setPaths(e.target.checked)}/>Inspected path</label><label className="transition-check"><input aria-label="Show original group positions" type="checkbox" checked={originals} onChange={e=>setOriginals(e.target.checked)}/>Original outlines</label><HelpButton title="Inspect group midpoint" className="button subtle" disabled={inputPending} onClick={()=>setCount(move.counts/2)}>Midpoint</HelpButton></div>
        <svg data-group-preview-count={local} className="transition-field" viewBox="-2 -2 104 57.333" role="img" aria-label="Group route movement field"><g transform={fieldViewTransform(project.field,c.preferences.value.fieldOrientation)}>
          <StaticFieldMarkings width={project.field.width} height={project.field.height} preset={project.field.preset} showGrid={false}/>
          {route&&<path data-group-route={route.id} d={routeSvg(route)} fill="none" stroke="#f1d39a" strokeWidth=".2" strokeDasharray=".5 .3"/>}
          {paths&&personId&&<path data-group-path={personId} d={movementSvg(project.sets[index].positions[personId],project.sets[index+1].positions[personId],path)} fill="none" stroke="var(--field-accent)" strokeWidth=".2"/>}
          {originals&&[...selected].map(id=><circle key={id} cx={baseline[id].x} cy={baseline[id].y} r=".65" fill="none" stroke="#fff" strokeWidth=".12"/>)}
          {project.performers.map(p=><circle key={p.id} data-group-performer={p.id} cx={positions[p.id].x} cy={positions[p.id].y} r={p.id===personId?'.6':selected.has(p.id)?'.42':'.23'} fill={project.sections.find(s=>s.id===p.sectionId)?.color} stroke={p.id===group.members[0]?'var(--field-accent)':'none'} strokeWidth=".25"><title>{p.label}{p.id===group.members[0]?' · leader/reference':''}</title></circle>)}
          {personId&&path&&Array.from({length:Math.min(32,move.counts)+1},(_,i)=>{const tick=i*move.counts/Math.min(32,move.counts),p=sampleMovement(project.sets[index].positions[personId],project.sets[index+1].positions[personId],path,tick,move.counts,move.transition);return <circle key={i} data-group-tick={tick} cx={p.x} cy={p.y} r=".15" fill="#fff"><title>Count {tick.toFixed(2)}</title></circle>;})}
        </g></svg>
        <p className="microcopy">{person?.label} at count {local.toFixed(2)}: X {personId?positions[personId].x.toFixed(3):'—'}, Y {personId?positions[personId].y.toFixed(3):'—'} yd. Dots and count ticks use playback. Selected travel/demand; full-cast flags. Along-route intervals do not guarantee physical clearance.</p>
        {route&&<p className="microcopy">{groupRoute(route).length.toFixed(3)} yd · {routeSeam(route)} · net leader advance {advance.toFixed(3)} yd ({(advance/groupRoute(route).length).toFixed(3)} net route lengths). Stop/turn cues and connectors are included. {plan?.pieces??0} derived travel intervals; the file stores the route reference and group program.</p>}
        {!!comparison?.issues.length&&<details><summary>Review proposed findings · {comparison.issueCount}</summary><ul className="transition-findings">{comparison.issues.map((issue,i)=><li key={i}><HelpButton title={`Inspect group finding ${i+1}`} className="button subtle" disabled={inputPending} onClick={()=>setCount(Math.max(0,Math.min(move.counts,(issue.atCount??start)-start)))}>{issue.message}</HelpButton></li>)}</ul>{comparison.issueCount>100&&<p className="microcopy">First 100 shown. Totals include every finding; use Problems after Apply for production review.</p>}</details>}
      </>}
    </div>
    <div className="modal-actions">
      {(stale||evaluated.error||message)&&<p className="field-error" role="alert">{stale?'The production, move or selection changed. Cancel and reopen this group review.':evaluated.error||message}</p>}
      {!!plan&&!stale&&!ready&&<p role={checks.fingerprint===fingerprint&&checks.status==='error'?'alert':'status'} data-group-check-status={checks.fingerprint===fingerprint?checks.status:'pending'}>{checks.fingerprint===fingerprint&&checks.status==='error'?checks.error:'Checking current and proposed group movement…'}</p>}
      <HelpButton title="Cancel group movement" className="button subtle" onClick={close}>Cancel</HelpButton>
      {checks.status==='error'&&<HelpButton title="Retry group movement checks" className="button subtle" disabled={inputPending||!plan||stale} onClick={()=>setRetry(n=>n+1)}>Retry movement checks</HelpButton>}
      {ready&&<span className="microcopy" data-group-check-status="ready">Movement checks ready</span>}
      <HelpButton title="Apply group movement" command="group.apply" className="button primary" disabled={stale||!!evaluated.error||inputPending||!ready||!plan?.changed} disabledReason={evaluated.error||'Finish entry, wait for checks and change the group before Apply.'} onClick={apply}>{remove?'Remove':copyMove?'Copy':'Apply'} group · one undo</HelpButton>
    </div>
  </Modal>;
}
