import type { AnalysisInput } from './analysis/input';
import { TransitionAnalyzer } from './analysis/engine';
import { compileTrack, peakStrideBounds } from './analysis/detailed';
import { movementLength } from './movementPaths';
import type { TransitionIssue } from './types';

export interface TransitionReviewMetrics {
  travel:number; longestTravel:number; demand:{lower:number;upper:number;converged:boolean};
  spacing:number; stride:number; possible:number;
}
export interface TransitionComparison {current:TransitionReviewMetrics;proposed:TransitionReviewMetrics;issues:TransitionIssue[];issueCount:number}
/** Use the playback paths and analysis engine for every displayed measurement. */
export async function compareTransitionMovement(current:AnalysisInput,proposed:AnalysisInput,ids:readonly string[],options:{canceled?:()=>boolean;budgetMs?:number;yieldTask?:()=>Promise<void>}={}):Promise<TransitionComparison> {
  const began=performance.now(),canceled=options.canceled??(()=>false),budget=options.budgetMs??20000;
  const pause=options.yieldTask??(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
  const check=()=>{if(canceled())throw Error('Transition comparison canceled.');if(performance.now()-began>budget)throw Error('Transition comparison exceeded its work budget. Retry with fewer selected members or simpler paths.');};
  if(ids.length<2||ids.length>500||new Set(ids).size!==ids.length)throw Error('Choose 2–500 unique members for comparison.');
  const selected=new Set(ids),analyzer=new TransitionAnalyzer();
  const measure=async(input:AnalysisInput)=>{
    let travel=0,longestTravel=0,lower=0,upper=0,converged=true,found=0;
    for(const [i,t] of input.tracks.entries())if(selected.has(t.id)) {
      check();found++;const distance=movementLength(t.from,t.to,t.path);travel+=distance;longestTravel=Math.max(longestTravel,distance);
      const work=peakStrideBounds(compileTrack(t,input.counts,input.transition));let next=work.next();
      while(!next.done){check();next=work.next();}
      lower=Math.max(lower,next.value.lower);upper=Math.max(upper,next.value.upper);converged&&=next.value.converged;
      if(i%16===0){await pause();check();}
    }
    if(found!==ids.length)throw Error('A selected member is missing from the reviewed move.');
    const analysis=await analyzer.analyze(input,()=>canceled()||performance.now()-began>budget,pause);check();if(!analysis)throw Error('Transition checks canceled.');
    return {metrics:{travel,longestTravel,demand:{lower,upper,converged},spacing:analysis.issues.filter(i=>i.type==='collision').length,
      stride:analysis.issues.filter(i=>i.type==='stride').length,possible:analysis.issues.filter(i=>i.certainty==='possible').length},issues:analysis.issues};
  };
  check();const before=await measure(current),after=await measure(proposed);check();
  return {current:before.metrics,proposed:after.metrics,issues:after.issues.slice(0,100),issueCount:after.issues.length};
}
