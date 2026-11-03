import type { FormationSession } from '../formationPreview';
import type { FormationOptions, Point } from '../types';
import { formationAssignmentOrder } from '../formationAssignment';

/** Reassignment is explicit. Carry each pin with its performer, never its old
 * rank. Retain old accepted dots as the pending preview until Regenerate. */
export function scatterMembers(session:FormationSession,ids:string[],positions:Record<string,Point>,options:FormationOptions=session.options):FormationSession {
  const scatter=session.scatter!,live=session.live!,oldOrder=session.order??session.ids;
  const previous=new Map(oldOrder.map((id,i)=>[id,{point:scatter.points[live.slots[i]],pinned:scatter.pinnedSlots.includes(live.slots[i])}]));
  const order=formationAssignmentOrder(positions,ids,'line',{...options,rotation:0});
  return {...session,ids,order,options,assignmentReviewed:undefined,scatterPending:true,scatterError:undefined,live:{...live,slotCount:Math.max(1,ids.length),slots:ids.map((_,i)=>i)},
    scatter:{...scatter,points:order.map(id=>({... (previous.get(id)?.point??positions[id])})),pinnedSlots:order.flatMap((id,i)=>previous.get(id)?.pinned?[i]:[])} };
}
