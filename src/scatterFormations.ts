import type { Point, Project, ScatterFormation, ScatterRegion, ScatterSettings } from './types';

export const SCATTER_ATTEMPTS = 200000;
export const SCATTER_TOLERANCE = 1e-8;
const fail = (message: string): never => { throw Error(`Invalid scatter: ${message}`); };
const distance = (a: Point,b: Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross = (a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const object = (v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail('expected an object.');
function point(v:unknown,field:Project['field']):Point {
  const p=object(v);
  if(typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x+p.y)||p.x<0||p.x>field.width||p.y<0||p.y>field.height)fail('region vertices and dots must stay inside the field.');
  return {x:p.x as number,y:p.y as number};
}
function onSegment(p:Point,a:Point,b:Point) {
  return Math.abs(cross(a,b,p))<=SCATTER_TOLERANCE*Math.hypot(b.x-a.x,b.y-a.y) && p.x>=Math.min(a.x,b.x)-SCATTER_TOLERANCE&&p.x<=Math.max(a.x,b.x)+SCATTER_TOLERANCE&&p.y>=Math.min(a.y,b.y)-SCATTER_TOLERANCE&&p.y<=Math.max(a.y,b.y)+SCATTER_TOLERANCE;
}
function intersect(a:Point,b:Point,c:Point,d:Point) {
  return onSegment(a,c,d)||onSegment(b,c,d)||onSegment(c,a,b)||onSegment(d,a,b)||cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0;
}
export function scatterBounds(region:ScatterRegion) {
  const xs=region.vertices.map(p=>p.x),ys=region.vertices.map(p=>p.y);
  return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
}
export function scatterArea(region:ScatterRegion):number {
  const b=scatterBounds(region);
  if(region.kind!=='polygon')return (b.right-b.left)*(b.bottom-b.top)*(region.kind==='ellipse'?Math.PI/4:1);
  return Math.abs(region.vertices.reduce((sum,p,i)=>{const q=region.vertices[(i+1)%region.vertices.length];return sum+p.x*q.y-p.y*q.x;},0))/2;
}
export function scatterContains(region:ScatterRegion,p:Point):boolean {
  const b=scatterBounds(region);
  if(p.x<b.left-SCATTER_TOLERANCE||p.x>b.right+SCATTER_TOLERANCE||p.y<b.top-SCATTER_TOLERANCE||p.y>b.bottom+SCATTER_TOLERANCE)return false;
  if(region.kind==='rectangle')return true;
  if(region.kind==='ellipse') {const rx=(b.right-b.left)/2,ry=(b.bottom-b.top)/2;return Math.hypot((p.x-(b.left+b.right)/2)/rx,(p.y-(b.top+b.bottom)/2)/ry)<=1+SCATTER_TOLERANCE/Math.max(rx,ry);}
  let inside=false;
  for(let i=0,j=region.vertices.length-1;i<region.vertices.length;j=i++) {
    const a=region.vertices[j],c=region.vertices[i];if(onSegment(p,a,c))return true;
    if((a.y>p.y)!==(c.y>p.y)&&p.x<(c.x-a.x)*(p.y-a.y)/(c.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function validateScatterSettings(value:unknown,field:Project['field']):ScatterSettings {
  const s=object(value),raw=object(s.region);
  if(s.version!==1)fail('unsupported generation version. Update Squidware.');
  if(typeof s.seed!=='string'||!s.seed.trim()||s.seed.length>80||/[\u0000-\u001f]/.test(s.seed))fail('use a seed of 1–80 characters without control characters.');
  if(!['rectangle','ellipse','polygon'].includes(raw.kind as string)||!Array.isArray(raw.vertices))fail('choose a rectangle, ellipse or polygon region.');
  if((raw.vertices as unknown[]).length>32)fail('use at most 32 region vertices.');
  const vertices=(raw.vertices as unknown[]).map(p=>point(p,field)),kind=raw.kind as ScatterRegion['kind'];
  if(kind==='polygon'?(vertices.length<3||vertices.length>32):vertices.length!==2)fail('use two opposite corners, or 3–32 polygon vertices.');
  const region={kind,vertices},b=scatterBounds(region);
  if(b.right-b.left<.1||b.bottom-b.top<.1||scatterArea(region)<.01)fail('the region needs width/depth of at least 0.1 yd and area of at least 0.01 square yard.');
  if(kind==='polygon') {
    for(let i=0;i<vertices.length;i++) {
      if(distance(vertices[i],vertices[(i+1)%vertices.length])<.01)fail('polygon edges must be at least 0.01 yd long.');
      for(let j=i+1;j<vertices.length;j++)if(j!==i+1&&!(i===0&&j===vertices.length-1)&&intersect(vertices[i],vertices[(i+1)%vertices.length],vertices[j],vertices[(j+1)%vertices.length]))fail('polygon edges cannot cross or touch non-adjacent edges.');
    }
  }
  if(typeof s.minimumSpacing!=='number'||!Number.isFinite(s.minimumSpacing)||s.minimumSpacing<.1||s.minimumSpacing>100)fail('minimum spacing must be 0.1–100 yd.');
  if(!['uniform','clustered'].includes(s.distribution as string)||typeof s.clusterStrength!=='number'||!Number.isFinite(s.clusterStrength)||s.clusterStrength<0||s.clusterStrength>1)fail('choose uniform/clustered density and cluster strength from 0 to 1.');
  return {version:1,seed:s.seed as string,region,minimumSpacing:s.minimumSpacing as number,distribution:s.distribution as ScatterSettings['distribution'],clusterStrength:s.clusterStrength as number};
}
export function validateScatterFormation(value:unknown,count:number,field:Project['field']):ScatterFormation {
  const s=object(value),settings=validateScatterSettings(value,field);
  if(!Array.isArray(s.points)||s.points.length!==count||count<1||count>500)fail('stored dots must match the 1–500 reserved slots.');
  const points=(s.points as unknown[]).map(p=>point(p,field));
  if(!Array.isArray(s.pinnedSlots)||s.pinnedSlots.length>count||s.pinnedSlots.some(v=>!Number.isInteger(v)||v<0||v>=count)||new Set(s.pinnedSlots).size!==s.pinnedSlots.length)fail('pin unique existing slots.');
  for(let i=0;i<points.length;i++) {
    if(!scatterContains(settings.region,points[i]))fail(`dot ${i+1} is outside the region. Regenerate or move it inside.`);
    for(let j=0;j<i;j++)if(distance(points[i],points[j])+SCATTER_TOLERANCE<settings.minimumSpacing)fail(`dots ${j+1} and ${i+1} are closer than the requested minimum spacing.`);
  }
  return {...settings,points,pinnedSlots:[...(s.pinnedSlots as number[])].sort((a,b)=>a-b) as number[]};
}
export function scatterSeedHash(seed:string):number {
  let value=2166136261;for(let i=0;i<seed.length;i++){value^=seed.charCodeAt(i);value=Math.imul(value,16777619);}return value>>>0;
}
/** Version 1: FNV-1a/UTF-16 seed and Mulberry32. No Math.random or wall clock. */
function random(seed:string) {
  let state=scatterSeedHash(seed);
  return ()=>{state=(state+0x6D2B79F5)>>>0;let n=Math.imul(state^(state>>>15),1|state);n^=n+Math.imul(n^(n>>>7),61|n);return ((n^(n>>>14))>>>0)/4294967296;};
}
/** Bounded rejection sampling with a spatial hash. Pins are installed first and
 * count toward spacing. Candidate density never relaxes the distance check.
 * Generation is distinct from assignment: free destinations sort by X/Y, then
 * fill unpinned slots; performer identities are owned by the formation session. */
export function generateScatter(input:ScatterSettings,count:number,pins:Record<number,Point>,field:Project['field']):ScatterFormation {
  const settings=validateScatterSettings(input,field);
  if(!Number.isInteger(count)||count<1||count>500)fail('select 1–500 performers before generating.');
  const rng=random(settings.seed),b=scatterBounds(settings.region),spacing=settings.minimumSpacing,grid=new Map<string,Point[]>(),result=Array<Point>(count),free:Point[]=[];
  const cell=(p:Point)=>[Math.floor(p.x/spacing),Math.floor(p.y/spacing)];
  const add=(p:Point)=>{const [x,y]=cell(p),key=`${x},${y}`;grid.set(key,[...(grid.get(key)??[]),p]);};
  const separated=(p:Point)=>{const [x,y]=cell(p);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const q of grid.get(`${x+dx},${y+dy}`)??[])if(distance(p,q)+SCATTER_TOLERANCE<spacing)return false;return true;};
  const pinnedSlots=Object.keys(pins).map(Number).sort((a,b)=>a-b);
  for(const slot of pinnedSlots) {
    if(!Number.isInteger(slot)||slot<0||slot>=count)fail('a pinned member is missing. Review membership before regenerating.');
    const p=point(pins[slot],field);
    if(!scatterContains(settings.region,p))fail('a pinned dot is outside the new region. Enlarge the region, move the dot or unpin it.');
    if(!separated(p))fail('pinned dots conflict with minimum spacing. Move or unpin them first.');
    result[slot]=p;add(p);
  }
  let attempts=0;
  const candidate=():Point=>({x:b.left+rng()*(b.right-b.left),y:b.top+rng()*(b.bottom-b.top)});
  const centers:Point[]=[];
  if(settings.distribution==='clustered')while(centers.length<2&&attempts<SCATTER_ATTEMPTS){const p=candidate();attempts++;if(scatterContains(settings.region,p))centers.push(p);}
  const sigma=Math.max(.1,Math.min(b.right-b.left,b.bottom-b.top)/10);
  while(free.length<count-pinnedSlots.length&&attempts<SCATTER_ATTEMPTS) {
    const p=candidate();attempts++;
    if(!scatterContains(settings.region,p))continue;
    if(settings.distribution==='clustered') {
      const density=Math.max(...centers.map(c=>Math.exp(-(distance(p,c)**2)/(2*sigma*sigma))));
      if(rng()>.005+.995*(1-settings.clusterStrength+settings.clusterStrength*density))continue;
    }
    if(separated(p)){free.push(p);add(p);}
  }
  if(free.length!==count-pinnedSlots.length)fail(`could not place all ${count} dots with ${spacing} yd spacing in the bounded search. Enlarge the region, reduce spacing or select fewer performers. No partial arrangement was accepted.`);
  free.sort((a,b)=>a.x-b.x||a.y-b.y);let cursor=0;for(let i=0;i<count;i++)if(!result[i])result[i]=free[cursor++];
  return {...settings,points:result,pinnedSlots};
}
export function scatterPreset(center:Point,field:Project['field']):ScatterSettings {
  const x=Math.max(20,Math.min(field.width-20,center.x)),y=Math.max(15,Math.min(field.height-15,center.y));
  return {version:1,seed:'scatter-1',minimumSpacing:1,distribution:'uniform',clusterStrength:.8,region:{kind:'rectangle',vertices:[{x:x-20,y:y-15},{x:x+20,y:y+15}]}};
}
