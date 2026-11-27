import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, OctagonAlert, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Modal } from '../components/Modal';
import { countToSeconds } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import { defaultProblemFilter, findings, type ProblemFilter } from '../analysis/show';
import { HelpButton } from './ControlHelp';
import { reviewProblem, useShowAnalysis, useShowChecks } from './ShowAnalysis';
import { commandRegistry } from './commands';
import { findingLocation, findingName, findingSummary, problemLabels } from './problemTrack';
import { useEditorSelector } from './react';
import type { EditorController } from './useEditorController';
import { formatTimelineCount as fmt } from './timelineNavigation';
import './problems.css';
const PAGE_SIZE = 40;
export function ProblemsPanel({ controller }: { controller: EditorController }) {
  const service = useShowAnalysis(), checks = useShowChecks();
  const { project } = checks;
  const [filter, setFilter] = useState<ProblemFilter>(defaultProblemFilter), [page, setPage] = useState(0);
  const rows = useMemo(() => findings(checks, filter), [checks.moves, filter]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const pending = checks.moves.filter(m => m.status === 'pending').length, failed = checks.moves.filter(m => m.status === 'error');
  const defaults = project.analysisRules?.defaults ?? DEFAULT_ANALYSIS_RULES;
  const total = checks.moves.reduce((sum, m) => sum + m.issues.length, 0);
  const openingOnly = checks.moves[0]?.index === 0;
  const labels = useMemo(() => problemLabels(project), [project]), rules = useEditorSelector(s => commandRegistry['analysis.rules-open'].enabled(s, undefined));
  function change(update: Partial<ProblemFilter>) { setFilter({ ...filter, ...update }); setPage(0); }
  const status = pending ? `Checking · ${checks.moves.length - pending} / ${checks.moves.length} ${openingOnly ? 'sets' : 'moves'}` : failed.length ? `${failed.length} ${failed.length === 1 ? 'move' : 'moves'} could not be checked` : total ? `${total} ${total === 1 ? 'problem' : 'problems'} to fix` : 'No problems';
  const clean = !pending && !failed.length && !total;
  // A short list of one kind needs no filters; they appear once there is something to narrow, or while one is set.
  const filtered = JSON.stringify(filter) !== JSON.stringify(defaultProblemFilter);
  const kinds = new Set(checks.moves.flatMap(m => m.issues.map(issue => issue.type))).size;
  return <Modal title="Show-wide problems" wide onClose={() => controller.setDialog(null)}>
    <div className="problems-panel" data-show-analysis-status={pending ? 'pending' : failed.length ? 'error' : 'ready'}>
      <div className="problems-summary">
        <div className={`problems-headline${clean ? ' is-clean' : ''}`}>{clean ? <CircleCheck size={18} /> : total ? <TriangleAlert size={18} /> : null}<strong>{status}</strong></div>
        <span className="problems-checked" role="status">{pending || failed.length ? `${checks.moves.length - pending - failed.length} of ${checks.moves.length} ${openingOnly ? 'sets' : 'moves'} checked` : checks.moves.length === 1 ? `The ${openingOnly ? 'set' : 'move'} is checked` : `All ${checks.moves.length} ${openingOnly ? 'sets' : 'moves'} checked`}</span>
        <HelpButton command="analysis.rules-open" title="Analysis rules" description={`Spacing and stride limits. Now: at least ${defaults.minimumSpacing} yd apart, steps no bigger than ${Number((5 / defaults.maximumStride).toFixed(2))}-to-5${project.analysisRules?.sections?.length ? `, with ${project.analysisRules.sections.length} section rules` : ''}.`} className="button subtle small" disabled={!rules} disabledReason="Finish or cancel the current input or preview before editing analysis rules." onClick={() => controller.dispatch('analysis.rules-open')}><SlidersHorizontal size={14} />Rules…</HelpButton>
      </div>
      {(total > 3 || kinds > 1 || filtered) && <div className="problem-filters" role="group" aria-label="Filter problems">
        <select aria-label="Problem type" value={filter.type} onChange={e => change({ type: e.target.value })}><option value="all">All types</option><option value="collision">Spacing</option><option value="stride">Stride</option><option value="clearance">Clearance</option></select>
        <select aria-label="Problem severity" value={filter.severity} onChange={e => change({ severity: e.target.value })}><option value="all">Any severity</option><option value="danger">Danger</option><option value="warning">Warning</option></select>
        <select aria-label="Problem move" value={filter.moveId} onChange={e => change({ moveId: e.target.value })}><option value="all">Whole show</option>{checks.moves.map(m => <option key={m.moveId} value={m.moveId}>{m.index ? `Set ${m.index} → ${m.index + 1} · ${project.sets[m.index].name}` : 'Opening set'}</option>)}</select>
        <select aria-label="Problem sort" value={filter.sort} onChange={e => change({ sort: e.target.value as ProblemFilter['sort'] })}><option value="count">In show order</option><option value="severity">Worst first</option><option value="move">By move</option></select>
        <span className="problem-search"><Search size={14} aria-hidden="true" /><input aria-label="Find a problem" value={filter.query} onChange={e => change({ query: e.target.value })} placeholder="Find a performer or set" /></span>
      </div>}
      {failed.length > 0 && <div role="alert" className="problems-alert"><p>{failed.map(m => `${findingLocation(project, m.index)}. ${m.error}`).join(' ')}</p><HelpButton title="Retry show checks" className="button small" onClick={service.retry}>Retry unavailable moves</HelpButton></div>}
      {!rows.length && !clean && <p className="section-description">{pending ? 'Waiting for the remaining checks. Problems appear here as they are found.' : total ? 'No problems match these filters.' : 'Resolve unavailable checks before relying on this result.'}</p>}
      {clean && <p className="section-description">{project.clearanceRules ? 'Spacing, step size and prop clearance are within the rules in every move.' : 'Spacing and step size are within the rules in every move.'}</p>}
      {rows.length > 0 && <ol className="problem-results" start={currentPage*PAGE_SIZE+1} aria-label="Matching problems">{rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map((row,i) => {
        const count=row.issue.atCount ?? 0, time=countToSeconds(project,count), name=findingName(row.issue,labels), danger=row.issue.severity==='danger';
        const location = findingLocation(project, row.index), summary = findingSummary(row.issue, project, row.index, labels);
        const identities = [row.issue.performerIds.length && `Performer IDs: ${row.issue.performerIds.join(', ')}`,
          row.issue.propIds?.length && `Prop IDs: ${row.issue.propIds.join(', ')}`].filter(Boolean).join(' · ');
        const range = row.issue.countRange && `${row.issue.countRange[1] - row.issue.countRange[0] < .001 ? String(row.issue.countRange[0]) : fmt(row.issue.countRange[0])}–${row.issue.countRange[1] - row.issue.countRange[0] < .001 ? String(row.issue.countRange[1]) : fmt(row.issue.countRange[1])}`;
        const unresolved = row.issue.measurement && !row.issue.measurement.converged;
        return <li key={`${row.moveId}:${currentPage}:${i}`}><HelpButton title={`Go to problem ${currentPage*PAGE_SIZE+i+1}: ${name}`} description={`${location} · ${row.issue.severity} ${row.issue.type} · show count ${fmt(count)} · ${time.toFixed(3)} seconds. ${row.issue.message}${row.issue.countRange ? ` Review show counts ${row.issue.countRange[0]}–${row.issue.countRange[1]}.` : ''} ${identities}. Pause here and highlight the affected participants.`} className={`problem-result ${row.issue.severity}`} onClick={() => reviewProblem(service,controller.store,row)}>
          <span className={`problem-severity ${row.issue.severity}`} aria-label={danger ? 'Danger' : 'Warning'}>{danger ? <OctagonAlert size={16} /> : <TriangleAlert size={16} />}</span>
          <span className="problem-text"><strong className="problem-headline">{summary.headline}</strong>
            <span className="problem-detail">{summary.detail}{(row.issue.certainty === 'possible' || unresolved) && <span className="problem-bound" data-problem-certainty={row.issue.certainty}>{unresolved ? 'Bounds remain unresolved' : 'Possible violation'}{range && <span data-problem-range> · review counts {range}</span>}</span>}</span></span>
          <span className="problem-where">{summary.where}</span>
          <span className="problem-go" aria-hidden="true">Go<ArrowRight size={14} /></span>
        </HelpButton></li>;
      })}</ol>}
      {rows.length > 0 && <div className="problem-pagination"><span role="status">{rows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)}` : '0'} of {rows.length} matching findings</span>{pages > 1 && <><HelpButton title="Previous problems page" className="icon-button" disabled={!currentPage} disabledReason="This is the first page." onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></HelpButton><span>{currentPage+1} / {pages}</span><HelpButton title="Next problems page" className="icon-button" disabled={currentPage+1 >= pages} disabledReason="This is the final page." onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></HelpButton></>}</div>}
      <details className="problems-method"><summary>How shows are checked</summary>
        <p className="microcopy">Every move is checked for performers closer than {defaults.minimumSpacing} yd and steps larger than {defaults.maximumStride} yd per count{project.analysisRules?.sections?.length ? `, with ${project.analysisRules.sections.length} section overrides` : ''}. Curved paths are checked against safe bounds: a confirmed problem has a measured moment that breaks the rule; a possible one could not be ruled out and is worth a look at the counts shown.</p>
      </details>
    </div>
  </Modal>;
}
