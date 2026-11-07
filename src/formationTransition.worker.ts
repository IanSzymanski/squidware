import { compareTransitionMovement } from './transitionComparison';
import type { AnalysisInput } from './analysis/input';
import { messageYield } from './workerYield';
const scope=self as unknown as {onmessage:(event:MessageEvent<{generation:number;current:AnalysisInput;proposed:AnalysisInput;ids:string[]}>)=>void;postMessage:(value:unknown)=>void};
let generation=0;const yieldTask=messageYield();
scope.onmessage=async({data})=>{generation=data.generation;const current=generation;
  try{const result=await compareTransitionMovement(data.current,data.proposed,data.ids,{canceled:()=>current!==generation,yieldTask});if(current===generation)scope.postMessage({generation:current,result});}
  catch(error){if(current===generation)scope.postMessage({generation:current,error:(error as Error).message});}
};
