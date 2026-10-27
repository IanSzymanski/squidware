import { canReviewProblems } from './analysisCommands';
import { useState } from 'react';
import { reviewProblem, useShowAnalysis } from './ShowAnalysis';
import { Check, CheckCheck, ChevronRight, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { useTransitionAnalysis } from './useTransitionAnalysis';
import type { EditorController } from './useEditorController';

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
  return <div aria-busy={pending} data-analysis-status={analysis.status}>
    <HelpButton command="analysis.problems-open" title="Show-wide problems" disabled={blocked} disabledReason="Finish or cancel the current input or preview before reviewing problems." className="button subtle" onClick={() => controller.dispatch('analysis.problems-open')}>Show-wide problems</HelpButton>
    <HelpButton command="analysis.rules-open" title="Analysis rules" className="button subtle" disabled={controller.pendingDraft || !!controller.selectionPreview || !!controller.transformPreview || !!controller.formationPreview || !!controller.spacingPreview || !!controller.coordinatePreview} disabledReason="Finish or cancel the current input or preview before editing analysis rules." onClick={() => controller.dispatch('analysis.rules-open')}>Analysis rules</HelpButton>
    {index > 0 && <p className="microcopy">{Object.keys(project.moves[index - 1].marchingDirections ?? {}).length} declared · {project.performers.length - Object.keys(project.moves[index - 1].marchingDirections ?? {}).length} unknown. Facing is not authored; travel vectors do not establish marching direction.</p>}
    <div className="section-title">
      <span><Icon size={15} /> {issues.length ? 'Flags to review' : 'Current move'}</span>
      <span className={`check-count ${issues.length || failed ? 'has-issues' : ''}`}>{pending ? '…' : failed ? '!' : issues.length || <Check size={12} />}</span>
    </div>
    {index === 0 ? <p className="section-description">Select the next set to check the transition into it.</p>
      : pending ? <p className="section-description" role="status">Checking this move…</p>
      : failed ? <>
        <p className="section-description" role="status">{analysis.error}</p>
        <Button className="button subtle" title="Retry transition check" onClick={analysis.retry}>Retry check</Button>
      </> : issues.length ? <>
        <p className="section-description">Review spacing and step size before rehearsal.</p>
        <div className="issue-list">{issues.slice(currentPage * 12, (currentPage + 1) * 12).map((issue, i) =>
          <HelpButton title="Review transition flag" disabled={blocked} disabledReason="Finish or cancel the current input or preview before navigating to a problem." description="Pause at the exact problem count, select affected performers and highlight their paths." key={i}
            onClick={() => reviewProblem(service, controller.store, { index, moveId: project.moves[index - 1].id, issue })}>
            <span className={`issue-dot ${issue.severity}`} /><span>{issue.message}</span><ChevronRight size={12} />
          </HelpButton>)}</div>
        {issues.length > 12 && <div className="problem-pagination"><HelpButton title="Previous move flags" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</HelpButton><span>{currentPage * 12 + 1}–{Math.min(issues.length, (currentPage + 1) * 12)} of {issues.length}</span><HelpButton title="Next move flags" disabled={(currentPage + 1) * 12 >= issues.length} onClick={() => setPage(currentPage + 1)}>Next</HelpButton></div>}
      </> : <p className="check-passed"><CheckCheck size={16} />No spacing or stride flags.</p>}
  </div>;
}
