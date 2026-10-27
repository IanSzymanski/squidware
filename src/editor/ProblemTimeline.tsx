import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { problemMarkers } from '../analysis/show';
import { useShowAnalysis, useShowChecks, reviewProblem } from './ShowAnalysis';
import { canReviewProblems } from './analysisCommands';
import { useEditorSelector, useEditorStore } from './react';
import { HelpButton } from './ControlHelp';
import { formatTimelineCount as fmt } from './timelineNavigation';
export function ProblemTimelineLabel() {
  const checks = useShowChecks(), store = useEditorStore();
  const pending = checks.moves.some(m => m.status === 'pending'), failed = checks.moves.some(m => m.status === 'error');
  const available = useEditorSelector(s => canReviewProblems(s) && !s.ui.dialog);
  const total = checks.moves.reduce((n,m) => n+m.issues.length,0);
  return <span className="problem-track-label"><HelpButton command="analysis.problems-open" title="Timeline problems" disabled={!available} disabledReason="Finish or cancel the current input or preview before reviewing problems." state={`${total} current findings · ${checks.moves.filter(m=>m.status==='pending').length} pending moves · ${checks.moves.filter(m=>m.status==='error').length} unavailable moves`} description="Open every show-wide spacing and stride finding. Timeline markers group nearby flags; the panel retains all of them." onClick={() => store.dispatch('analysis.problems-open')}><TriangleAlert size={11} />{pending ? '…' : failed ? '!' : total}</HelpButton></span>;
}
export function ProblemTimeline({ start, span, width }: { start: number; span: number; width: number }) {
  const checks = useShowChecks(), service = useShowAnalysis(), store = useEditorStore();
  const available = useEditorSelector(canReviewProblems);
  const markers = useMemo(() => problemMarkers(checks.moves,start,span,width),[checks.moves,start,span,width]);
  return <div className="problem-track" aria-label="Problem count markers">{markers.map((marker,i) => <HelpButton key={i} title={`Problem marker ${i+1}`} disabled={!available} disabledReason="Finish or cancel the current input or preview before navigating to a problem." description={`${marker.count} finding${marker.count===1?'':'s'} near show count ${fmt(marker.finding.issue.atCount??0)}. Go to the first finding; use Show-wide problems for every finding.`} className={`problem-marker ${marker.danger?'danger':'warning'}`} style={{left:`${((marker.finding.issue.atCount??0)-start)/span*100}%`}} onClick={() => reviewProblem(service,store,marker.finding)}><TriangleAlert size={11}/></HelpButton>)}</div>;
}
