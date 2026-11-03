import { compileRoute, validateSharedRoutes } from './sharedRoutes';
import type { BezierAnchor, BezierFormation, Point, Project, SharedRoute } from './types';

const mix = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y);
export function bezierRoute(shape: BezierFormation): SharedRoute {
  return { id:'formation',name:'Formation geometry',closed:false,start:shape.anchors[0].point,
    segments:shape.anchors.slice(1).map((a,i)=>({id:a.id,kind:'cubic',to:a.point,control1:shape.anchors[i].outgoing,control2:a.incoming})) };
}
export function validateBezierFormation(value: unknown, field: Project['field']): BezierFormation {
  const fail = (message = 'Use 2–33 unique anchors with finite field coordinates and valid tangent modes.'): never => { throw Error(`Invalid Bézier formation: ${message}`); };
  if (!value || typeof value !== 'object' || !Array.isArray((value as BezierFormation).anchors)) return fail();
  const raw = (value as BezierFormation).anchors;
  if (raw.length < 2 || raw.length > 33) return fail();
  const ids = new Set<string>();
  const point = (p: Point): Point => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return fail('Anchor and tangent coordinates must be finite numbers.');
    if (p.x<0 || p.x>field.width || p.y<0 || p.y>field.height) return fail('Keep every anchor and tangent handle inside the field. Move the anchor inward or shorten its handles.');
    return {x:p.x,y:p.y};
  };
  const anchors = raw.map((a,i): BezierAnchor => {
    if (!a || typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(a.id) || ['__proto__','constructor','prototype'].includes(a.id) || ids.has(a.id) || !['corner','smooth','symmetric'].includes(a.mode)) return fail();
    ids.add(a.id);
    const anchor = {id:a.id,point:point(a.point),incoming:point(a.incoming),outgoing:point(a.outgoing),mode:a.mode};
    if (i>0 && i<raw.length-1 && a.mode!=='corner') {
      const u={x:anchor.incoming.x-anchor.point.x,y:anchor.incoming.y-anchor.point.y},v={x:anchor.outgoing.x-anchor.point.x,y:anchor.outgoing.y-anchor.point.y};
      const l=Math.hypot(u.x,u.y),r=Math.hypot(v.x,v.y);
      if (l*r>1e-12 && (Math.abs(u.x*v.y-u.y*v.x)>1e-6*l*r || u.x*v.x+u.y*v.y>0)) return fail();
      if (a.mode==='symmetric' && Math.abs(l-r)>1e-6) return fail();
    }
    return anchor;
  });
  const shape = {anchors};
  validateSharedRoutes([bezierRoute(shape)],field);
  return shape;
}
/** Same adaptive arc-length evaluator as travel routes: .001 yd length budget,
 * .0005 yd local parameter bound. Slots include both endpoints. */
export function bezierFormationPoints(shape: BezierFormation, count: number): Point[] {
  if (!Number.isInteger(count) || count<2 || count>500) throw Error('Bézier formations need 2–500 slots. Select at least two performers.');
  const route = compileRoute(bezierRoute(shape));
  return Array.from({length:count},(_,i)=>route.atDistance(route.length*i/(count-1)));
}
export function bezierPreset(center: Point, wave: boolean, field: Project['field']): BezierFormation {
  const x=Math.max(16,Math.min(field.width-16,center.x)),y=Math.max(11,Math.min(field.height-11,center.y));
  return {anchors:[
    {id:'anchor-start',point:{x:x-15,y},incoming:{x:x-15,y},outgoing:{x:x-5,y:y-10},mode:'corner'},
    {id:'anchor-end',point:{x:x+15,y},incoming:{x:x+5,y:y+(wave?10:-10)},outgoing:{x:x+15,y},mode:'corner'}]};
}
/** Anchor translation carries both handles. A handle edit preserves the opposite
 * length in smooth mode, or mirrors it in symmetric mode. Zero handles are legal. */
export function moveBezierPoint(shape: BezierFormation, id: string, part: 'point'|'incoming'|'outgoing', target: Point): BezierFormation {
  return {anchors:shape.anchors.map(a=>{
    if(a.id!==id)return a;
    if(part==='point') { const shift=(p:Point)=>({x:p.x+target.x-a.point.x,y:p.y+target.y-a.point.y}); return {...a,point:target,incoming:shift(a.incoming),outgoing:shift(a.outgoing)}; }
    const other=part==='incoming'?'outgoing':'incoming', length=distance(target,a.point);
    const opposite=a.mode==='corner'?a[other]:length ? {x:a.point.x-(target.x-a.point.x)*(a.mode==='symmetric'?1:distance(a[other],a.point)/length),y:a.point.y-(target.y-a.point.y)*(a.mode==='symmetric'?1:distance(a[other],a.point)/length)} : a.point;
    return {...a,[part]:target,[other]:opposite};
  })};
}
export function setBezierMode(shape: BezierFormation,id:string,mode:BezierAnchor['mode']): BezierFormation {
  const changed={anchors:shape.anchors.map(a=>a.id===id?{...a,mode}:a)};
  const a=changed.anchors.find(a=>a.id===id)!;
  return moveBezierPoint(changed,id,'outgoing',a.outgoing);
}
/** Exact de Casteljau split; symmetric adjacent joins become smooth because
 * subdivision shortens just one of their handles. Stable existing IDs survive. */
export function insertBezierAnchor(shape: BezierFormation,index: number,id: string): BezierFormation {
  if (shape.anchors.length>=33 || index<0 || index>=shape.anchors.length-1) throw Error('Choose a segment to split; at most 33 anchors are supported.');
  const anchors=structuredClone(shape.anchors),a=anchors[index],b=anchors[index+1];
  const ab=mix(a.point,a.outgoing),bc=mix(a.outgoing,b.incoming),cd=mix(b.incoming,b.point),abc=mix(ab,bc),bcd=mix(bc,cd);
  a.outgoing=ab;b.incoming=cd;
  if(a.mode==='symmetric')a.mode='smooth';if(b.mode==='symmetric')b.mode='smooth';
  anchors.splice(index+1,0,{id,point:mix(abc,bcd),incoming:abc,outgoing:bcd,mode:'smooth'});
  return {anchors};
}
export function deleteBezierAnchor(shape: BezierFormation,id:string): BezierFormation {
  if(shape.anchors.length<=2)throw Error('Keep at least two anchors.');
  return {anchors:shape.anchors.filter(a=>a.id!==id)};
}
