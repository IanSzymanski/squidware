import { optimizeAssignment } from './assignmentOptimization';
import type { AssignmentProblem } from './assignmentOptimization';
import type { AssignmentConstraints } from './types';
import { messageYield } from './workerYield';
const scope=self as unknown as {onmessage:(event:MessageEvent<{generation:number;problem:AssignmentProblem;constraints:AssignmentConstraints}>)=>void;postMessage:(data:unknown)=>void};
let generation=0;const yieldTask=messageYield();
scope.onmessage=async({data})=>{generation=data.generation;const current=generation;
  try{const result=await optimizeAssignment(data.problem,data.constraints,{canceled:()=>current!==generation,yieldTask});if(current===generation)scope.postMessage({generation:current,result});}
  catch(error){if(current===generation)scope.postMessage({generation:current,error:(error as Error).message});}
};
