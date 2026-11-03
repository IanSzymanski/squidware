import type { AssignmentConstraints, AssignmentPair, LiveFormation, Performer } from './types';

export const emptyAssignmentConstraints = ():AssignmentConstraints=>({pins:[],forbidden:[],sectionSlots:[],roleSlots:[],roles:{},unknownRoles:'reject',orderedGroups:[]});
const fail=(message:string):never=>{throw Error(`Invalid assignment constraints: ${message}`);};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail('expected an object.');
const text=(v:unknown,max=80):string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f]/.test(v)?v.trim():fail(`use nonblank text of at most ${max} characters without control characters.`);
const identifier=(v:unknown):string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v)?v:fail('use a valid ID.');
const list=(v:unknown,max:number):unknown[]=>Array.isArray(v)&&v.length<=max?v:fail(`use an array of at most ${max} entries.`);
export const hasAssignmentConstraints=(c:AssignmentConstraints)=>!!(c.pins.length||c.forbidden.length||c.sectionSlots.length||c.roleSlots.length||Object.keys(c.roles).length||c.orderedGroups.length);
export const assignmentRole=(c:AssignmentConstraints,id:string)=>Object.hasOwn(c.roles,id)?c.roles[id]:undefined;

export function validateAssignmentConstraints(value:unknown,members:readonly string[],slotCount:number,sections:readonly string[]):AssignmentConstraints {
  const c=object(value),ids=new Set(members),sectionIds=new Set(sections);
  const member=(v:unknown)=>{const id=identifier(v);if(!ids.has(id))fail('a referenced performer is not a member. Clear or review constraints before changing membership.');return id;};
  const slot=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<slotCount?v:fail('choose an existing slot.');
  const pairs=(v:unknown,max:number,uniqueMember=false):AssignmentPair[]=>{
    const seen=new Set<string>(),people=new Set<string>();
    return list(v,max).map(raw=>{const p=object(raw),performerId=member(p.performerId),s=slot(p.slot),key=`${performerId}:${s}`;
      if(seen.has(key)||uniqueMember&&people.has(performerId))fail('pairings must be unique; each performer has at most one pin.');seen.add(key);people.add(performerId);return {performerId,slot:s};}).sort((a,b)=>a.performerId.localeCompare(b.performerId,'en')||a.slot-b.slot);
  };
  const slots=<T extends object>(v:unknown,read:(d:Record<string,unknown>)=>T)=>{const seen=new Set<number>();return list(v,500).map(raw=>{const d=object(raw),s=slot(d.slot);if(seen.has(s))fail('each slot has at most one rule of each kind.');seen.add(s);return {slot:s,...read(d)};}).sort((a,b)=>a.slot-b.slot);};
  const sectionSlots=slots(c.sectionSlots,d=>{const sectionId=identifier(d.sectionId);if(!sectionIds.has(sectionId))fail('a section rule refers to a missing section. Review constraints before deleting sections.');return {sectionId};});
  const roleSlots=slots(c.roleSlots,d=>({role:text(d.role,40)}));
  const roleData=object(c.roles);if(Object.keys(roleData).length>500)fail('use at most 500 role tags.');
  const roles=Object.fromEntries(Object.entries(roleData).map(([id,role])=>[member(id),text(role,40)]).sort(([a],[b])=>a<b?-1:a>b?1:0));
  if(c.unknownRoles!=='reject'&&c.unknownRoles!=='allow')fail('explicitly choose how unknown roles behave.');
  const groupIds=new Set<string>(),orderedMembers=new Set<string>();
  const orderedGroups=list(c.orderedGroups,64).map(raw=>{const g=object(raw),id=identifier(g.id),name=text(g.name),performerIds=list(g.performerIds,500).map(member),groupSlots=list(g.slots,500).map(slot);
    if(groupIds.has(id)||performerIds.length<2||performerIds.length!==groupSlots.length)fail('ordered groups need unique IDs and matching lists of 2–500 members/slots.');groupIds.add(id);
    performerIds.forEach(id=>{if(orderedMembers.has(id))fail('a member can belong to only one ordered group.');orderedMembers.add(id);});
    if(groupSlots.some((s,i)=>i>0&&s<=groupSlots[i-1]))fail('an ordered group’s slots must increase strictly.');
    return {id,name,performerIds,slots:groupSlots};});
  return {pins:pairs(c.pins,500,true),forbidden:pairs(c.forbidden,5000),sectionSlots,roleSlots,roles,unknownRoles:c.unknownRoles as 'reject'|'allow',orderedGroups};
}

/** These are hard eligibility rules. Ordered groups explicitly map their shown
 * member sequence to their shown slot sequence; no heuristic may reorder it. */
export function assignmentAllowed(c:AssignmentConstraints,performer:Performer,slot:number):boolean {
  if(c.pins.some(p=>p.performerId===performer.id&&p.slot!==slot)||c.pins.some(p=>p.slot===slot&&p.performerId!==performer.id))return false;
  if(c.forbidden.some(p=>p.performerId===performer.id&&p.slot===slot))return false;
  const section=c.sectionSlots.find(r=>r.slot===slot);if(section&&section.sectionId!==performer.sectionId)return false;
  const role=c.roleSlots.find(r=>r.slot===slot),tag=assignmentRole(c,performer.id);if(role&&(tag?tag!==role.role:c.unknownRoles==='reject'))return false;
  for(const group of c.orderedGroups){const index=group.performerIds.indexOf(performer.id),rank=group.slots.indexOf(slot);if(index>=0&&group.slots[index]!==slot||rank>=0&&group.performerIds[rank]!==performer.id)return false;}
  return true;
}
export function compileAssignmentEligibility(c:AssignmentConstraints) {
  const fixed=new Map<string,number>(),reserved=new Map<number,string>(),bad=new Set<string>();
  const lock=(id:string,slot:number)=>{if(fixed.has(id)&&fixed.get(id)!==slot)bad.add(id);if(reserved.has(slot)&&reserved.get(slot)!==id){bad.add(id);bad.add(reserved.get(slot)!);}fixed.set(id,slot);reserved.set(slot,id);};
  c.pins.forEach(p=>lock(p.performerId,p.slot));c.orderedGroups.forEach(g=>g.performerIds.forEach((id,i)=>lock(id,g.slots[i])));
  const forbidden=new Set(c.forbidden.map(p=>`${p.performerId}:${p.slot}`)),sections=new Map(c.sectionSlots.map(s=>[s.slot,s.sectionId])),roles=new Map(c.roleSlots.map(s=>[s.slot,s.role])),tags=new Map(Object.entries(c.roles));
  return (person:Performer,slot:number)=>!bad.has(person.id)&&(!fixed.has(person.id)||fixed.get(person.id)===slot)&&(!reserved.has(slot)||reserved.get(slot)===person.id)&&!forbidden.has(`${person.id}:${slot}`)&&(!sections.has(slot)||sections.get(slot)===person.sectionId)&&(!roles.has(slot)||(tags.has(person.id)?tags.get(person.id)===roles.get(slot):c.unknownRoles==='allow'));
}
export function assertAssignmentMapping(c:AssignmentConstraints,members:LiveFormation['members'],cast:readonly Performer[]) {
  for(const {performerId,slot} of members){const person=cast.find(p=>p.id===performerId);if(!person||!assignmentAllowed(c,person,slot))fail(`the current mapping for ${person?.label??performerId} to slot ${slot+1} violates a pin, section, role, order or prohibited pairing. Review or clear constraints in Optimize assignment.`);}
}
/** Detachment is an explicit membership removal, not a reassignment. Remaining
 * pins/group slots retain their meaning; vacant slot rules remain reserved. */
export function pruneAssignmentConstraints(c:AssignmentConstraints,members:LiveFormation['members']):AssignmentConstraints|undefined {
  const ids=new Set(members.map(m=>m.performerId));
  const next={...c,pins:c.pins.filter(p=>ids.has(p.performerId)),forbidden:c.forbidden.filter(p=>ids.has(p.performerId)),roles:Object.fromEntries(Object.entries(c.roles).filter(([id])=>ids.has(id))),
    orderedGroups:c.orderedGroups.flatMap(g=>{const indices=g.performerIds.flatMap((id,i)=>ids.has(id)?[i]:[]);return indices.length>=2?[{...g,performerIds:indices.map(i=>g.performerIds[i]),slots:indices.map(i=>g.slots[i])}]:[];})};
  return hasAssignmentConstraints(next)?next:undefined;
}
