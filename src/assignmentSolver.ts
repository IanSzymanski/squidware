/** Dependency-free assignment core shared by the optimizer review and synchronous formation defaults. */
export class AssignmentInfeasible extends Error {}
export const infeasibleMessage='No complete assignment satisfies these constraints. Review pins, ordered groups, prohibited pairings, section/role rules and fixed path endpoints. The production has not changed.';
/** Dense shortest-augmenting-path Hungarian solver. Missing edges are Infinity,
 * never a large penalty that could accidentally accept a prohibited pairing.
 * Stable row/column traversal defines deterministic ties. */
export function solveAssignment(costs:Float64Array,n:number,objective:'distance'|'balanced'='distance',check=()=>{}):number[] {
  if(!Number.isInteger(n)||n<1||n>500||costs.length!==n*n)throw Error('Assignment matrix must be square with 1–500 members.');
  if(costs.some(c=>Number.isNaN(c)||c<0))throw Error('Assignment costs must be nonnegative finite lengths or Infinity.');
  const u=new Float64Array(n+1),v=new Float64Array(n+1),p=new Int32Array(n+1),way=new Int32Array(n+1);let operations=0;
  for(let row=1;row<=n;row++) {
    check();p[0]=row;let column=0;const min=new Float64Array(n+1).fill(Infinity),used=new Uint8Array(n+1);
    do {
      used[column]=1;const source=p[column];let delta=Infinity,next=0;
      for(let j=1;j<=n;j++)if(!used[j]) {
        if(++operations%16384===0)check();
        const length=costs[(source-1)*n+j-1];
        if(Number.isFinite(length)){const reduced=(objective==='balanced'?length*length:length)-u[source]-v[j];if(reduced<min[j]){min[j]=reduced;way[j]=column;}}
        if(min[j]<delta){delta=min[j];next=j;}
      }
      if(!Number.isFinite(delta))throw new AssignmentInfeasible(infeasibleMessage);
      for(let j=0;j<=n;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
      column=next;
    }while(p[column]!==0);
    do {const previous=way[column];p[column]=p[previous];column=previous;}while(column!==0);
  }
  return Array.from(p.slice(1),row=>row-1);
}
