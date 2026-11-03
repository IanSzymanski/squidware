import { useState } from 'react';
import { NumberField } from '../components/NumberField';
import { deleteBezierAnchor, insertBezierAnchor, moveBezierPoint, setBezierMode } from '../bezierFormations';
import { compileRoute } from '../sharedRoutes';
import { bezierRoute } from '../bezierFormations';
import { uid } from '../domain';
import type { BezierAnchor } from '../types';
import type { EditorController } from './useEditorController';
import { HelpButton } from './ControlHelp';

export function BezierFormationFields({controller:c}:{controller:EditorController}) {
  const shape=c.formationPreview!.bezier!;
  const selected=c.formationPreview!.bezierAnchorId;
  const setSelected=(id:string)=>c.dispatch('formation.bezier-select',{id});
  const [inputEpoch,setInputEpoch]=useState(0);
  const [part,setPart]=useState<'point'|'incoming'|'outgoing'>('point');
  const anchor=shape.anchors.find(a=>a.id===selected)??shape.anchors[0],index=shape.anchors.indexOf(anchor);
  const update=(bezier:typeof shape)=>{const accepted=c.dispatch('formation.bezier-update',{bezier});if(!accepted)setInputEpoch(n=>n+1);return accepted;};
  const change=(axis:'x'|'y',value:number)=>update(moveBezierPoint(shape,anchor.id,part,{...anchor[part],[axis]:value}));
  return <div className="bezier-fields">
    <label className="form-label"><span>Curve anchor</span><select aria-label="Curve anchor" value={anchor.id} disabled={c.pendingDraft} onChange={e=>setSelected(e.target.value)}>{shape.anchors.map((a,i)=><option value={a.id} key={a.id}>Anchor {i+1}{i===0?' · start':i===shape.anchors.length-1?' · end':''}</option>)}</select></label>
    <label className="form-label"><span>Point or tangent</span><select aria-label="Point or tangent" value={part} disabled={c.pendingDraft} onChange={e=>setPart(e.target.value as typeof part)}><option value="point">Anchor</option><option value="incoming">Incoming handle</option><option value="outgoing">Outgoing handle</option></select></label>
    <div className="form-row"><NumberField key={`${anchor.id}-${part}-x-${inputEpoch}`} label="Curve X · yd" value={Number(anchor[part].x.toFixed(6))} min={0} max={c.project.field.width} step={.1} onDraftChange={c.setPendingDraft} onChange={v=>change('x',v)}/><NumberField key={`${anchor.id}-${part}-y-${inputEpoch}`} label="Curve Y · yd" value={Number(anchor[part].y.toFixed(6))} min={0} max={c.project.field.height} step={.1} onDraftChange={c.setPendingDraft} onChange={v=>change('y',v)}/></div>
    <label className="form-label"><span>Tangent join</span><select aria-label="Tangent join" value={anchor.mode} disabled={c.pendingDraft} onChange={e=>update(setBezierMode(shape,anchor.id,e.target.value as BezierAnchor['mode']))}><option value="corner">Corner · independent handles</option><option value="smooth">Smooth · aligned, own lengths</option><option value="symmetric">Symmetric · mirrored handles</option></select></label>
    <div className="form-row"><HelpButton title="Insert curve anchor" description="Split the following segment exactly at its parameter midpoint. Existing symmetric joins become smooth." className="button subtle" disabled={c.pendingDraft||index===shape.anchors.length-1||shape.anchors.length>=33} onClick={()=>{const id=uid();if(update(insertBezierAnchor(shape,index,id)))setSelected(id);}}>Split after</HelpButton>
      <HelpButton title="Delete curve anchor" description="Remove this anchor and reconnect neighboring handles. The preview changes shape; Apply accepts it." className="button subtle" disabled={c.pendingDraft||shape.anchors.length<=2} onClick={()=>update(deleteBezierAnchor(shape,anchor.id))}>Delete anchor</HelpButton></div>
    <p className="microcopy">{compileRoute(bezierRoute(shape)).length.toFixed(2)} yd · {shape.anchors.length} anchors. Slots follow equal distances along the curve. Drag anchors or handles on the field; numbers provide keyboard entry. Snapping follows field settings.</p>
    <p className="microcopy">Split preserves the curve. Delete reconnects it and may change its shape. Apply accepts the preview as one undo step; Cancel keeps saved geometry. Moving an individual dot later detaches it.</p>
  </div>;
}
