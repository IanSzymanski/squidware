import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { bezierRoute, moveBezierPoint } from '../bezierFormations';
import { routeSvg } from '../sharedRoutes';
import { DEFAULT_SNAPPING, moveSelection } from '../snapping';
import type { BezierFormation, Point, Project } from '../types';
import type { FieldFormationPreview } from './FormationHandles';

export function BezierFormationHandles({preview,project,scale,snap}:{preview:FieldFormationPreview;project:Project;scale:number;snap:boolean}) {
  const root=useRef<SVGGElement>(null),drag=useRef<{id:string;part:'point'|'incoming'|'outgoing';shape:BezierFormation}|null>(null);
  const update=useRef(preview.onBezierUpdate);update.current=preview.onBezierUpdate;
  useEffect(()=>{const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopPropagation();update.current?.(drag.current.shape);drag.current=null;}};window.addEventListener('keydown',cancel,true);return()=>window.removeEventListener('keydown',cancel,true);},[]);
  const shape=preview.session.bezier!;
  const at=(e:PointerEvent)=>{const matrix=root.current?.getScreenCTM();if(!matrix)return null;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return {x:p.x,y:p.y};};
  const finish=(e:PointerEvent<SVGGElement>,cancel=false)=>{e.stopPropagation();const active=drag.current;drag.current=null;if(cancel&&active)preview.onBezierUpdate?.(active.shape);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
  const handle=(id:string,part:'point'|'incoming'|'outgoing',point:Point)=><g key={`${id}-${part}`} data-bezier-anchor={id} data-bezier-part={part} transform={`translate(${point.x} ${point.y})`} style={{cursor:'crosshair',touchAction:'none'}}
    onPointerDown={e=>{e.stopPropagation();e.preventDefault();if(e.button!==0||preview.invalidInput)return;preview.onBezierSelect?.(id);drag.current={id,part,shape};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{e.stopPropagation();const a=drag.current,p=at(e);if(!a||!p)return;const source=a.shape.anchors.find(v=>v.id===a.id)![a.part];const target=moveSelection({handle:source},['handle'],{x:p.x-source.x,y:p.y-source.y},project.field,project.snapping??DEFAULT_SNAPPING,snap).handle;preview.onBezierUpdate?.(moveBezierPoint(a.shape,a.id,a.part,target));}}
    onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(drag.current)finish(e,true);}}>
    <title>{part==='point'?'Anchor':`${part} tangent`} · drag to preview; edit numbers in the Inspector</title>
    <circle r={13/scale} fill="transparent" stroke="none"/>{part==='point'?<rect x={-5/scale} y={-5/scale} width={10/scale} height={10/scale} fill={preview.session.bezierAnchorId===id ? 'var(--accent)' : 'var(--surface)'}/>:<circle r={4/scale} fill="var(--surface)"/>}
  </g>;
  return <g ref={root} className="formation-handles bezier-handles" aria-hidden="true" stroke={preview.result.error?'#ffb6aa':'#8dc8ff'} strokeWidth={1.5/scale}>
    <g pointerEvents="none" fill="none"><path data-bezier-curve="true" d={routeSvg(bezierRoute(shape))}/>
      {shape.anchors.map((a,i)=><path key={a.id} strokeDasharray={`${3/scale} ${3/scale}`} d={`M${(i?a.incoming:a.point).x},${(i?a.incoming:a.point).y}L${a.point.x},${a.point.y}L${(i<shape.anchors.length-1?a.outgoing:a.point).x},${(i<shape.anchors.length-1?a.outgoing:a.point).y}`}/>)}
      {preview.session.ids.map(id=><path key={id} strokeDasharray={`${4/scale} ${3/scale}`} d={`M${preview.original[id].x},${preview.original[id].y}L${preview.result.positions[id].x},${preview.result.positions[id].y}`}/>)}
    </g>
    {shape.anchors.flatMap((a,i)=>[...(i?[handle(a.id,'incoming',a.incoming)]:[]),...(i<shape.anchors.length-1?[handle(a.id,'outgoing',a.outgoing)]:[]),handle(a.id,'point',a.point)])}
  </g>;
}
