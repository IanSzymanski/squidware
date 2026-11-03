import { useEffect, useMemo, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Point, Project, ScatterFormation } from '../types';
import { scatterBounds } from '../scatterFormations';
import { DEFAULT_SNAPPING, moveSelection } from '../snapping';
import { neighborOverlays } from '../neighborPaths';
import { NeighborDrawing } from './NeighborDrawing';
import type { FieldFormationPreview } from './FormationHandles';

export function ScatterFormationHandles({preview,project,scale,snap}:{preview:FieldFormationPreview;project:Project;scale:number;snap:boolean}) {
  const session=preview.session,s=session.scatter!,b=scatterBounds(s.region);
  const root=useRef<SVGGElement>(null),drag=useRef<{kind:'vertex'|'dot';index:number;scatter:ScatterFormation;pending:boolean}|null>(null);
  const restore=useRef(preview.onScatterRestore);restore.current=preview.onScatterRestore;
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();restore.current?.(drag.current.scatter,drag.current.pending);drag.current=null;}};window.addEventListener('keydown',cancel,true);return()=>window.removeEventListener('keydown',cancel,true);},[]);
  const neighbors=useMemo(()=>preview.result.error||session.scatterShowTravel===false?[]:neighborOverlays({...project,sets:project.sets.map(set=>set.id===session.setId?{...set,positions:preview.result.positions}:set)},project.sets.findIndex(set=>set.id===session.setId),{previous:true,next:true,selectedIds:session.ids,sectionFilter:'all',preview:false}),[project,session.setId,session.ids,session.scatterShowTravel,preview.result]);
  const at=(e:PointerEvent)=>{const matrix=root.current?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};};
  const finish=(e:PointerEvent<SVGGElement>,cancel=false)=>{e.stopPropagation();const old=drag.current;drag.current=null;if(cancel&&old)preview.onScatterRestore?.(old.scatter,old.pending);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
  const handle=(kind:'vertex'|'dot',index:number,p:Point)=><g key={`${kind}-${index}`} data-scatter-handle={kind} data-scatter-index={index} transform={`translate(${p.x} ${p.y})`} style={{cursor:'crosshair',touchAction:'none'}}
    onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(e.button!==0||preview.invalidInput||kind==='dot'&&session.scatterPending)return;preview.onScatterSelect?.(kind==='dot'?{slot:index}:{vertex:index});drag.current={kind,index,scatter:s,pending:!!session.scatterPending};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{e.stopPropagation();const a=drag.current,p=at(e);if(!a||!p)return;const from=a.kind==='dot'?a.scatter.points[a.index]:a.scatter.region.vertices[a.index];const target=moveSelection({handle:from},['handle'],{x:p.x-from.x,y:p.y-from.y},project.field,project.snapping??DEFAULT_SNAPPING,snap).handle;
      if(a.kind==='dot')preview.onScatterPoint?.(a.index,target);else preview.onScatterRegion?.({...a.scatter.region,vertices:a.scatter.region.vertices.map((v,i)=>i===a.index?target:v)});}}
    onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(drag.current)finish(e,true);}}>
    <title>{kind==='vertex'?`Region vertex ${index+1}`:`Scatter member slot ${index+1}${s.pinnedSlots.includes(index)?' · pinned':''}`} · drag to preview; numeric editing is in the Inspector</title>
    <circle r={13/scale} fill="transparent" stroke="none"/>{kind==='vertex'?<rect x={-5/scale} y={-5/scale} width={10/scale} height={10/scale} fill="var(--surface)"/>:<circle r={(s.pinnedSlots.includes(index)?8:6)/scale} fill="none" strokeDasharray={s.pinnedSlots.includes(index)?`${2/scale} ${2/scale}`:undefined}/>}</g>;
  return <g ref={root} className="formation-handles scatter-handles" stroke="var(--field-accent)" strokeWidth={1.5/scale} aria-hidden="true">
    <NeighborDrawing overlays={neighbors} scale={scale}/>
    <g fill="none" pointerEvents="none" strokeDasharray={`${5/scale} ${4/scale}`}>
      {s.region.kind==='rectangle'?<rect data-scatter-region="rectangle" x={b.left} y={b.top} width={b.right-b.left} height={b.bottom-b.top}/>:s.region.kind==='ellipse'?<ellipse data-scatter-region="ellipse" cx={(b.left+b.right)/2} cy={(b.top+b.bottom)/2} rx={(b.right-b.left)/2} ry={(b.bottom-b.top)/2}/>:<polygon data-scatter-region="polygon" points={s.region.vertices.map(p=>`${p.x},${p.y}`).join(' ')}/>}
    </g>
    {s.region.vertices.map((p,i)=>handle('vertex',i,p))}
    {session.live!.slots.map(slot=>s.points[slot]?handle('dot',slot,s.points[slot]):null)}
  </g>;
}
