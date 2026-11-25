import { directionSummary } from '../analysis/rules';
import { canReviewProblems } from './analysisCommands';
import { useMemo, useState } from 'react';
import { reviewProblem, useShowAnalysis } from './ShowAnalysis';
import { Check, CheckCheck, ChevronRight, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { useTransitionAnalysis } from './useTransitionAnalysis';
import type { EditorController } from './useEditorController';
import { OPENING_CLEARANCE_ID } from '../analysis/clearanceRules';

export function TransitionCheck({ controller }: { controller: EditorController }) {
  const service = useShowAnalysis();
  const [page, setPage] = useState(0);
  const { project, index, projectEpoch } = controller;
  // Subscribe only to this move; other results update their own consumers.
  const analysis = useTransitionAnalysis(project, index, projectEpoch);
  const { issues } = analysis;
  const pending = analysis.status === 'pending', failed = analysis.status === 'error';
  const blocked = !canReviewProblems(controller.store.getState());
  const Icon = pending ? LoaderCircle : failed || issues.length ? TriangleAlert : ShieldCheck;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(issues.length / 12) - 1));
  const directions = useMemo(() => index > 0 ? directionSummary(project, index - 1) : null, [project, index]);
  const checkOpening = !project.moves.length && !!project.clearanceRules && !!project.stagingObjects?.length;
  return <div aria-busy={pending} data-analysis-status={analysis.status}>
    {directions && <p className="microcopy">{directions.declared} declared · {directions['authored facing']} from facing · {directions.unknown} unknown</p>}
    <div className="section-title">
      <span><Icon size={15} /> {issues.length ? 'Flags to review' : checkOpening ? 'Opening set' : 'Current move'}</span>
      <span className={`check-count ${issues.length || failed ? 'has-issues' : ''}`}>{pending ? '…' : failed ? '!' : issues.length || <Check size={12} />}</span>
    </div>
    {index === 0 && !checkOpening ? <p className="section-description">Select the next set to check the transition into it.</p>
      : pending ? <p className="section-description" role="status">{checkOpening ? 'Checking the opening set…' : 'Checking this move…'}</p>
      : failed ? <>
        <p className="section-description" role="status">{analysis.error}</p>
        <Button className="button subtle" title="Retry transition check" onClick={analysis.retry}>Retry check</Button>
      </> : issues.length ? <>
        <p className="section-description">Review the flagged geometry before rehearsal.</p>
        <div className="issue-list">{issues.slice(currentPage * 12, (currentPage + 1) * 12).map((issue, i) =>
          <HelpButton title="Review transition flag" disabled={blocked} disabledReason="Finish or cancel the current input or preview before navigating to a problem." description={issue.type === 'clearance' ? 'Pause at the problem count and outline the affected footprints.' : 'Pause at the exact problem count, select affected performers and highlight their paths.'} key={i}
            onClick={() => reviewProblem(service, controller.store, { index, moveId: project.moves[index - 1]?.id ?? OPENING_CLEARANCE_ID, issue })}>
            <span className={`issue-dot ${issue.severity}`} /><span>{issue.message}</span><ChevronRight size={12} />
          </HelpButton>)}</div>
        {issues.length > 12 && <div className="problem-pagination"><HelpButton title="Previous move flags" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</HelpButton><span>{currentPage * 12 + 1}–{Math.min(issues.length, (currentPage + 1) * 12)} of {issues.length}</span><HelpButton title="Next move flags" disabled={(currentPage + 1) * 12 >= issues.length} onClick={() => setPage(currentPage + 1)}>Next</HelpButton></div>}
      </> : <p className="check-passed"><CheckCheck size={16} />{project.clearanceRules ? 'No flags in the configured checks.' : 'No spacing or stride flags.'}</p>}
  </div>;
}
