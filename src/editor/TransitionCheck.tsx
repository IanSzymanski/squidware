import { Check, CheckCheck, ChevronRight, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from './EditorControls';
import { HelpButton } from './ControlHelp';
import { useTransitionAnalysis } from './useTransitionAnalysis';
import type { EditorController } from './useEditorController';

export function TransitionCheck({ controller }: { controller: EditorController }) {
  const { project, index, projectEpoch, preferences } = controller;
  // Worker replies update this panel without invalidating the editor shell,
  // field, timeline or sibling Inspector controls during playback.
  const analysis = useTransitionAnalysis(project, index, projectEpoch, preferences.value);
  const { issues } = analysis;
  const pending = analysis.status === 'pending', failed = analysis.status === 'error';
  const Icon = pending ? LoaderCircle : failed || issues.length ? TriangleAlert : ShieldCheck;
  return <div aria-busy={pending} data-analysis-status={analysis.status}>
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
        <div className="issue-list">{issues.slice(0, 12).map((issue, i) =>
          <HelpButton title="Review transition flag" description="Select the affected performers and show their travel paths on this set." key={i}
            onClick={() => { controller.setSelectedIds(issue.performerIds); controller.setShowPaths(true); controller.setWorkspace('design'); controller.selectSet(index); }}>
            <span className={`issue-dot ${issue.severity}`} /><span>{issue.message}</span><ChevronRight size={12} />
          </HelpButton>)}</div>
        {issues.length > 12 && <p className="microcopy">+ {issues.length - 12} more issues. Adjust the formation and recheck.</p>}
      </> : <p className="check-passed"><CheckCheck size={16} />No spacing or stride flags.</p>}
  </div>;
}
