import { compileRoute } from './sharedRoutes';
import type { GroupMotion, Move, PathSegment, PerformerPath, Point, Project, SharedRoute, LinePathSegment, CubicPathSegment, HoldPathSegment } from './types';

export const GROUP_LIMITS = { groups: 32, cues: 32, pieces: 4096, movePieces: 100000, projectPieces: 200000, laps: 16 } as const;
type SegmentDraft = Omit<LinePathSegment,'id'> | Omit<CubicPathSegment,'id'> | Omit<HoldPathSegment,'id'>;
const EPS = 1e-8;
function fail(message:string):never { throw Error(`Group movement: ${message}`); }
const same = (a:Point,b:Point) => Math.hypot(a.x-b.x,a.y-b.y)<=EPS;
const clamp = (n:number,a:number,b:number) => Math.max(a,Math.min(b,n));
const mix = (a:Point,b:Point,t:number):Point => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const routeCache = new WeakMap<SharedRoute,ReturnType<typeof compileRoute>>();
export function groupRoute(route:SharedRoute) { let c=routeCache.get(route);if(!c){c=compileRoute(route);routeCache.set(route,c);}return c; }
export const groupOwner = (move:Move,id:string) => move.groupMotions?.find(g=>g.members.includes(id));
export function assertIndividualMovement(move:Move,id:string) {
  if(groupOwner(move,id))fail('this member uses group movement. Edit that group or remove the member there before editing/copying individual travel.');
}
function directionAt(g:GroupMotion,count:number):number {
  let direction=g.cues[0].direction;for(const cue of g.cues){if(cue.count>count)break;direction=cue.direction;}return direction;
}
/** Signed leader displacement from clock zero, including explicit negative history. */
export function leaderDistance(g:GroupMotion,count:number):number {
  const lo=Math.min(0,count),hi=Math.max(0,count),cuts=[lo,...g.cues.map(c=>c.count).filter(c=>c>lo&&c<hi),hi];
  let distance=0;for(let i=1;i<cuts.length;i++)distance+=(cuts[i]-cuts[i-1])*directionAt(g,(cuts[i]+cuts[i-1])/2)*g.speed;
  return g.phase+(count<0?-distance:distance);
}
export function memberDistance(g:GroupMotion,rank:number,count:number):number {
  return g.mode==='conveyor'?leaderDistance(g,count)+g.offsetDirection*rank*g.interval:leaderDistance(g,count-rank*g.delay);
}
function split(points:Point[],t:number):[Point[],Point[]] {
  const left=[points[0]],right=[points.at(-1)!];let row=points;
  while(row.length>1){row=row.slice(1).map((p,i)=>mix(row[i],p,t));left.push(row[0]);right.unshift(row.at(-1)!);}return [left,right];
}
function crop(points:Point[],a:number,b:number):Point[] {
  if(a>b)return crop(points,b,a).reverse();
  let p=b===1?points:split(points,b)[0];if(a>0)p=split(p,a/b)[1];return p;
}
/** Distance lookup cells become exact time-polynomial pieces. Playback and
 * conservative analysis consume these same pieces, never a sampled polyline. */
function routePieces(route:SharedRoute,a:number,b:number,start:number,end:number,append:(s:SegmentDraft)=>void) {
  const compiled=groupRoute(route),L=compiled.length;
  if(a===b){append({kind:'hold',startCount:start,endCount:end});return;}
  if(route.closed&&Math.abs(b-a)/L>GROUP_LIMITS.laps)fail('one travel leg exceeds 16 route lengths. Reduce speed or duration.');
  const lo=Math.min(a,b),hi=Math.max(a,b),cuts=[a,b];
  const add=(d:number)=>{if(d>lo&&d<hi){cuts.push(d);if(cuts.length>GROUP_LIMITS.pieces+1)fail('route sampling exceeds 4,096 pieces per member. Simplify the route or travel.');}};
  if(route.closed){for(let lap=Math.floor(lo/L);lap<=Math.floor(hi/L);lap++)for(const e of compiled.table)add(lap*L+e.length);}
  else {add(0);add(L);for(const e of compiled.table)add(e.length);}
  // Lap offsets and member phases can put the same table boundary a few ulps
  // apart. Such slivers amplify coordinate roundoff into false peak strides.
  // Coalesce only generated distance cuts at floating-point resolution, keeping
  // the authored leg's exact endpoints (and thus cue/connector times) intact.
  const resolution=16*Number.EPSILON*Math.max(L,Math.abs(a),Math.abs(b));
  const ordered=[a];
  for(const d of cuts.sort((x,y)=>a<b?x-y:y-x))
    if(Math.abs(d-ordered.at(-1)!)>resolution&&Math.abs(d-b)>resolution)ordered.push(d);
  ordered.push(b);
  for(let i=1;i<ordered.length;i++){
    const x=ordered[i-1],y=ordered[i],mid=(x+y)/2;
    const count=(d:number)=>d===a?start:d===b?end:start+(d-a)/(b-a)*(end-start);
    const startCount=count(x),endCount=count(y);if(!(endCount>startCount))fail('travel timing is too small to represent.');
    if(!route.closed&&(mid<0||mid>L)){append({kind:'hold',startCount,endCount});continue;}
    const lap=route.closed?Math.floor(mid/L):0,local=mid-lap*L;
    let low=0,high=compiled.table.length-1;
    while(low<high){const m=(low+high)>>1;if(compiled.table[m].length<local)low=m+1;else high=m;}
    const right=compiled.table[low],left=compiled.table[Math.max(0,low-1)],s=route.segments[right.segment];
    const from=right.segment?route.segments[right.segment-1].to:route.start,span=right.length-left.length;
    if(!(span>0))fail('route sampling contains a zero-length distance cell.');
    const firstT=left.segment===right.segment?left.t:0;
    const parameter=(d:number)=>clamp(firstT+(right.t-firstT)*(d-lap*L-left.length)/span,0,1);
    const p=crop(s.kind==='cubic'?[from,s.control1,s.control2,s.to]:[from,s.to],parameter(x),parameter(y));
    append(p.length===4?{kind:'cubic',startCount,endCount,to:p[3],control1:p[1],control2:p[2]}:{kind:'line',startCount,endCount,to:p[1]});
  }
}
export function groupMemberPath(project:Project,index:number,g:GroupMotion,rank:number,remaining:number=GROUP_LIMITS.pieces):PerformerPath {
  const move=project.moves[index],route=project.sharedRoutes?.find(r=>r.id===g.routeId);if(!route)fail('choose an existing shared route.');
  const compiled=groupRoute(route),duration=move.counts-g.exitCounts-g.entryCounts,id=g.members[rank];
  const label=project.performers.find(p=>p.id===id)?.label??id;
  const from=project.sets[index].positions[id],to=project.sets[index+1].positions[id],first=compiled.atDistance(memberDistance(g,rank,0)),last=compiled.atDistance(memberDistance(g,rank,duration));
  if(!g.entryCounts&&!same(first,from))fail(`${label} does not start on the reviewed route position. Add an explicit entry connector or prepare the source set.`);
  if(!g.exitCounts&&!same(last,to))fail(`${label} does not finish on the destination. Add an explicit exit connector or prepare the destination set.`);
  const segments:PathSegment[]=[];
  const append=(s:SegmentDraft)=>{if(segments.length>=Math.min(GROUP_LIMITS.pieces,remaining))fail('the generated travel budget is exhausted. Simplify routes, reduce laps or select fewer members.');segments.push({...s,id:'group-'+segments.length} as PathSegment);};
  if(g.entryCounts)append({kind:'line',startCount:0,endCount:g.entryCounts,to:first});
  const delay=g.mode==='conveyor'?0:rank*g.delay,cuts=[0,...g.cues.map(c=>c.count+delay).filter(c=>c>0&&c<duration),duration];
  for(let i=1;i<cuts.length;i++){
    const a=memberDistance(g,rank,cuts[i-1]),b=memberDistance(g,rank,cuts[i]);
    if(!route.closed&&g.endpointPolicy==='reject'&&(Math.min(a,b)<-EPS||Math.max(a,b)>compiled.length+EPS))fail(`insufficient open-route history or length for ${label}. Reduce delay/travel, adjust phase, or explicitly choose endpoint holds.`);
    routePieces(route,a,b,cuts[i-1]===0?g.entryCounts:g.entryCounts+cuts[i-1],cuts[i]===duration?move.counts-g.exitCounts:g.entryCounts+cuts[i],append);
  }
  if(g.exitCounts)append({kind:'line',startCount:move.counts-g.exitCounts,endCount:move.counts});
  const lastTravel=segments.reduce((n,s,i)=>s.kind==='hold'?n:i,-1);
  if(lastTravel<0&&(from.x!==to.x||from.y!==to.y))fail(`${label}: a hold-only group schedule requires identical endpoint dots or a positive connector.`);
  if(lastTravel>=0){const s=segments[lastTravel];if(s.kind!=='hold'){const {to:_to,...last}=s;segments[lastTravel]=last;}}
  return {segments,linearCounts:true};
}
const projectWork=new WeakMap<Project,{pieces:number}>();
const moveCache=new WeakMap<Project,Map<number,Move>>();
/** The only adapter from persisted group programs to existing travel consumers. */
export function effectiveMove(project:Project,index:number):Move {
  const move=project.moves[index];if(!move?.groupMotions?.length)return move;
  let cache=moveCache.get(project);if(!cache){cache=new Map();moveCache.set(project,cache);}const hit=cache.get(index);if(hit)return hit;
  const paths={...move.paths};let total=0;let work=projectWork.get(project);if(!work){work={pieces:0};projectWork.set(project,work);}
  for(const g of move.groupMotions)for(let rank=0;rank<g.members.length;rank++){
    const path=groupMemberPath(project,index,g,rank,Math.min(GROUP_LIMITS.movePieces-total,GROUP_LIMITS.projectPieces-work.pieces));total+=path.segments.length;work.pieces+=path.segments.length;
    if(total>GROUP_LIMITS.movePieces)fail('this move exceeds 100,000 generated travel pieces. Simplify routes, reduce laps or select fewer members.');
    paths[g.members[rank]]=path;
  }
  const result={...move,paths};cache.set(index,result);return result;
}
function object(v:unknown):Record<string,unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail('expected a group object.');}
function num(v:unknown,min:number,max:number,label:string):number{return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(`${label} must be finite, from ${min} to ${max}.`);}
function identifier(v:unknown):string{return typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)?v:fail('use an existing, nonreserved identifier.');}
export function validateGroupMotions(value:unknown,project:Project,index:number):GroupMotion[]|undefined {
  if(value===undefined)return undefined;if(!Array.isArray(value)||value.length>GROUP_LIMITS.groups)fail('use at most 32 groups per move.');
  const move=project.moves[index],used=new Set<string>(),ids=new Set<string>(),names=new Set<string>();
  const result=value.map(raw=>{
    const r=object(raw),id=identifier(r.id);if(typeof r.routeId!=='string'||!r.routeId)fail('choose an existing shared route.');const routeId=identifier(r.routeId);
    if(ids.has(id))fail('group IDs must be unique within a move.');ids.add(id);
    if(typeof r.name!=='string'||!r.name.trim()||r.name.length>80||/[\u0000-\u001f]/.test(r.name))fail('use a group name of 1–80 characters.');
    const name=r.name.trim();if(names.has(name.toLowerCase()))fail('group names must be unique within a move.');names.add(name.toLowerCase());
    const route=project.sharedRoutes?.find(route=>route.id===routeId);if(!route)fail('a referenced shared route is missing.');
    if(!['follow','countermarch','conveyor'].includes(String(r.mode)))fail('choose Follow the leader, Counter-march or Conveyor.');
    if(!Array.isArray(r.members)||r.members.length<2||r.members.length>500)fail('choose 2–500 ordered members.');
    const members=r.members.map(identifier);
    for(const member of members){if(used.has(member)||!project.performers.some(p=>p.id===member))fail('members must exist and belong to only one group per move.');used.add(member);}
    const mode=r.mode as GroupMotion['mode'],delay=num(r.delay,0,4096,'Follower delay'),interval=num(r.interval,.01,1000,'Along-route interval');
    if(r.offsetDirection!==-1&&r.offsetDirection!==1)fail('choose an offset direction of −1 or +1.');
    if(r.endpointPolicy!=='hold'&&r.endpointPolicy!=='reject')fail('choose explicit endpoint holds or reject insufficient route length.');
    const entryCounts=num(r.entryCounts,0,move.counts,'Entry counts'),exitCounts=num(r.exitCounts,0,move.counts,'Exit counts'),duration=move.counts-exitCounts-entryCounts;
    if(duration<=0)fail('entry and exit connectors must leave positive route travel time.');
    const phase=num(r.phase,-1000000,1000000,'Initial phase'),speed=num(r.speed,.001,100,'Speed');
    const history=mode==='conveyor'?0:(members.length-1)*delay;
    if(!Array.isArray(r.cues)||!r.cues.length||r.cues.length>GROUP_LIMITS.cues)fail('use 1–32 direction/stop cues.');
    let previous=-Infinity;
    const cues=r.cues.map(raw=>{const c=object(raw),count=num(c.count,-history,duration,'Cue clock');if(count<=previous||count===duration)fail('cue clocks must increase strictly and precede the route arrival.');previous=count;
      if(c.direction!==-1&&c.direction!==0&&c.direction!==1)fail('a cue direction must be −1, 0 (stop), or +1.');return {count,direction:c.direction as -1|0|1};});
    if(cues[0].count>0)fail('provide an initial cue at or before leader clock zero.');
    if(mode==='countermarch'&&!(cues.some(c=>c.direction===1)&&cues.some(c=>c.direction===-1)))fail('Counter-march requires explicit forward and reverse direction cues. Facing is separate from travel.');
    const length=groupRoute(route).length;
    if(route.closed&&mode==='conveyor'&&members.length*interval>length+EPS)fail('the closed conveyor is crowded: include the last-to-first interval in route capacity.');
    if(!route.closed&&mode==='conveyor'&&(members.length-1)*interval>length+EPS)fail('the open route cannot hold the configured member intervals.');
    return {id,name,routeId,mode,members,delay,interval,offsetDirection:r.offsetDirection,phase,speed,entryCounts,exitCounts,endpointPolicy:r.endpointPolicy,cues} as GroupMotion;
  });
  return result.length?result:undefined;
}
export function rescaleGroupMotions(groups:GroupMotion[]|undefined,before:number,after:number):GroupMotion[]|undefined {
  if(!groups)return undefined;const ratio=after/before;
  return groups.map(g=>({...g,members:[...g.members],entryCounts:g.entryCounts*ratio,exitCounts:g.exitCounts*ratio,delay:g.delay*ratio,speed:g.speed/ratio,cues:g.cues.map(c=>({...c,count:c.count*ratio}))}));
}
/** Exact physical time reversal. Follow order reverses, including the complete
 * negative leader history; conveyor order/offsets stay fixed. */
export function reverseGroupMotion(g:GroupMotion,counts:number):GroupMotion {
  const duration=counts-g.exitCounts-g.entryCounts,history=g.mode==='conveyor'?0:(g.members.length-1)*g.delay,origin=duration-history;
  const cuts=[-history,...g.cues.slice(1).map(c=>origin-c.count).filter(c=>c>-history&&c<duration)].sort((a,b)=>a-b);
  const cues=cuts.map((count,i)=>({count,direction:-directionAt(g,origin-(count+(cuts[i+1]??duration))/2) as -1|0|1}));
  return {...g,phase:leaderDistance(g,origin),members:g.mode==='conveyor'?[...g.members]:[...g.members].reverse(),entryCounts:g.exitCounts,exitCounts:g.entryCounts,cues};
}
