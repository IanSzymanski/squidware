import { compareTransitionMovement } from './transitionComparison';
import type { AnalysisInput } from './analysis/input';
const scope=self as unknown as {onmessage:(event:MessageEvent<{generation:number;current:AnalysisInput;proposed:AnalysisInput;ids:string[]}>)=>void;postMessage:(value:unknown)=>void};
let generation=0;
scope.onmessage=async({data})=>{generation=data.generation;const current=generation;
  try{const result=await compareTransitionMovement(data.current,data.proposed,data.ids,{canceled:()=>current!==generation});if(current===generation)scope.postMessage({generation:current,result});}
  catch(error){if(current===generation)scope.postMessage({generation:current,error:(error as Error).message});}
};
