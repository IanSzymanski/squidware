import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { scatterArea, scatterBounds } from '../scatterFormations';
import type { ScatterRegion, ScatterSettings } from '../types';
import { HelpButton } from './ControlHelp';
import type { EditorController } from './useEditorController';
import { useShowChecks } from './ShowAnalysis';

export function ScatterFormationFields({controller:c}:{controller:EditorController}) {
  const session=c.formationPreview!,s=session.scatter!,region=s.region;
  const [epoch,setEpoch]=useState(0),checks=useShowChecks();
  const vertex=Math.min(session.scatterVertex??0,region.vertices.length-1),p=region.vertices[vertex];
  const slot=session.live!.slots.includes(session.scatterSlot??-1)?session.scatterSlot!:session.live!.slots[0],dot=s.points[slot];
  const order=session.order??session.ids;
  const update=(patch:Partial<ScatterSettings>)=>{if(!c.dispatch('scatter.update',{settings:{...s,...patch}}))setEpoch(n=>n+1);};
  const changeRegion=(patch:Partial<ScatterRegion>)=>update({region:{...region,...patch}});
  const changePoint=(axis:'x'|'y',value:number)=>{if(!c.dispatch('scatter.point',{slot,point:{...dot,[axis]:value}}))setEpoch(n=>n+1);};
  const changeVertex=(axis:'x'|'y',value:number)=>changeRegion({vertices:region.vertices.map((v,i)=>i===vertex?{...v,[axis]:value}:v)});
  const kind=(kind:ScatterRegion['kind'])=>{const b=scatterBounds(region);changeRegion({kind,vertices:kind==='polygon'?[{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.right,y:b.bottom},{x:b.left,y:b.bottom}]:[{x:b.left,y:b.top},{x:b.right,y:b.bottom}]});};
  const number=(label:string,value:number,onChange:(v:number)=>void,max:number,min=0)=><NumberField key={`${label}-${epoch}-${vertex}-${slot}`} label={label} value={Number(value.toFixed(6))} min={min} max={max} step={.1} onDraftChange={c.setPendingDraft} onChange={onChange}/>;
  const draft=checks.draft;
  return <div className="scatter-fields">
    <label className="live-keep"><input aria-label="Show scatter movement paths" type="checkbox" checked={session.scatterShowTravel!==false} disabled={c.pendingDraft} onChange={e=>c.dispatch('scatter.display',{travel:e.target.checked})}/>Show entry/exit paths and flags</label>
    <label className="form-label"><span>Scatter seed</span><input aria-label="Scatter seed" maxLength={80} value={s.seed} disabled={c.pendingDraft} onChange={e=>update({seed:e.target.value})}/></label>
    <label className="form-label"><span>Scatter region</span><select aria-label="Scatter region" value={region.kind} disabled={c.pendingDraft} onChange={e=>kind(e.target.value as ScatterRegion['kind'])}><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option></select></label>
    <label className="form-label"><span>Region vertex</span><select aria-label="Region vertex" value={vertex} disabled={c.pendingDraft} onChange={e=>c.dispatch('scatter.select',{vertex:Number(e.target.value)})}>{region.vertices.map((_,i)=><option key={i} value={i}>{region.kind==='polygon'?`Vertex ${i+1}`:`Opposite corner ${i+1}`}</option>)}</select></label>
    <div className="form-row">{number('Region X · yd',p.x,v=>changeVertex('x',v),c.project.field.width)}{number('Region Y · yd',p.y,v=>changeVertex('y',v),c.project.field.height)}</div>
    {region.kind==='polygon'&&<div className="form-row"><HelpButton title="Insert region vertex" className="button subtle" disabled={c.pendingDraft||region.vertices.length>=32} onClick={()=>{const next=region.vertices[(vertex+1)%region.vertices.length],vertices=[...region.vertices];vertices.splice(vertex+1,0,{x:(p.x+next.x)/2,y:(p.y+next.y)/2});changeRegion({vertices});}}>Split edge</HelpButton><HelpButton title="Delete region vertex" className="button subtle" disabled={c.pendingDraft||region.vertices.length<=3} onClick={()=>changeRegion({vertices:region.vertices.filter((_,i)=>i!==vertex)})}>Delete vertex</HelpButton></div>}
    {number('Minimum spacing · yd',s.minimumSpacing,v=>update({minimumSpacing:v}),100,.1)}
    <label className="form-label"><span>Scatter density</span><select aria-label="Scatter density" value={s.distribution} disabled={c.pendingDraft} onChange={e=>update({distribution:e.target.value as ScatterSettings['distribution']})}><option value="uniform">Uniform</option><option value="clustered">Clustered</option></select></label>
    {s.distribution==='clustered'&&number('Cluster strength',s.clusterStrength,v=>update({clusterStrength:v}),1)}
    {(session.scatterPending||session.scatterError)&&<p className="field-error" role="alert">{session.scatterError??'Settings changed. Regenerate before Apply.'}</p>}
    <div className="form-row"><HelpButton command="scatter.regenerate" title="Regenerate scatter" className="button primary" disabled={c.pendingDraft||!session.ids.length} onClick={()=>c.dispatch('scatter.regenerate',{})}>Regenerate</HelpButton><HelpButton command="scatter.regenerate" title="Reroll scatter" description="Choose a new seed and regenerate unpinned dots. Pinned dots stay fixed." className="button subtle" disabled={c.pendingDraft||!session.ids.length} onClick={()=>c.dispatch('scatter.regenerate',{reroll:true})}>Reroll</HelpButton></div>
    <p className="microcopy">{scatterArea(region).toFixed(2)} square yd · {session.ids.length} members · {session.live!.slotCount} reserved slots. Larger casts or wider intervals need more area. Minimum spacing is never reduced.</p>
    <p className="microcopy">Settings and membership changes require Regenerate. Current dots stay in the preview until it succeeds. Pins keep their shown positions and participate in spacing. Vacant slots stay reserved until Redistribute members.</p>
    {dot&&<><label className="form-label"><span>Scatter member</span><select aria-label="Scatter member" value={slot} disabled={c.pendingDraft} onChange={e=>c.dispatch('scatter.select',{slot:Number(e.target.value)})}>{order.map((id,i)=><option key={id} value={session.live!.slots[i]}>{c.project.performers.find(p=>p.id===id)?.label??id}</option>)}</select></label>
      <label className="live-keep"><input aria-label="Pin scatter member" type="checkbox" checked={s.pinnedSlots.includes(slot)} disabled={c.pendingDraft} onChange={e=>c.dispatch('scatter.pin',{slot,pinned:e.target.checked})}/>Pin this member on regeneration</label>
      {!session.scatterPending&&<div className="form-row">{number('Scatter dot X · yd',dot.x,v=>changePoint('x',v),c.project.field.width)}{number('Scatter dot Y · yd',dot.y,v=>changePoint('y',v),c.project.field.height)}</div>}</>}
    <p className="microcopy">Squares edit the region; circles move member dots. Numeric dot edits keep membership. Moving a dot outside this preview detaches it. Apply accepts the whole preview as one undo step.</p>
    <p className="microcopy" role="status">Incoming paths: blue dashes · outgoing paths: gold dots. Both use the playback evaluator. {draft?draft.state.status==='ready'?`${draft.state.result?.issues.length??0} movement flags; inspect highlighted paths.`:`Movement checks ${draft.state.status}.`:'Generate a valid preview to check adjacent moves.'} {session.scatterShowTravel===false?'Paths hidden; checks remain active. ':''}Destination spacing does not guarantee clearance during movement or against unrelated performers.</p>
  </div>;
}
