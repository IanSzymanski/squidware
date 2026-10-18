import type { Point } from '../types';
import type { CoordinateEntryResult, CoordinateEntrySession } from '../drillEntry';

export interface FieldCoordinatePreview {
  session:CoordinateEntrySession;result:CoordinateEntryResult;original:Record<string,Point>;
  onApply:()=>void;onCancel:()=>void;
}
export function CoordinateGuides({preview,scale}:{preview:FieldCoordinatePreview;scale:number}) {
  const {session,result,original}=preview;
  if(!result.parsed)return null;
  return <g className="coordinate-guides" aria-hidden="true" pointerEvents="none" fill="none" stroke={result.error?'#ffb6aa':'#8dc8ff'} strokeWidth={1.5/scale}>
    {session.ids.map(id=>{const before=original[id];const after=result.positions[id];return <g key={id}>
      <circle cx={before.x} cy={before.y} r={6/scale} strokeDasharray={`${3/scale} ${3/scale}`}/>
      <path data-coordinate-path={id} d={`M${before.x},${before.y}L${after.x},${after.y}`} strokeDasharray={`${4/scale} ${3/scale}`}/>
      <path d={`M${after.x-9/scale},${after.y}h${18/scale}M${after.x},${after.y-9/scale}v${18/scale}`}/>
    </g>;})}
  </g>;
}
