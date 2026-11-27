import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, OctagonAlert, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Modal } from '../components/Modal';
import { countToSeconds, setStartCount } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import { defaultProblemFilter, findings, type ProblemFilter } from '../analysis/show';
import { HelpButton } from './ControlHelp';
import { reviewProblem, useShowAnalysis, useShowChecks } from './ShowAnalysis';
import { commandRegistry } from './commands';
import { findingLocation, findingName, findingQuantity, findingType, problemLabels } from './problemTrack';
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
  return <Modal title="Show-wide problems" wide onClose={() => controller.setDialog(null)}>
    <div className="problems-panel" data-show-analysis-status={pending ? 'pending' : failed.length ? 'error' : 'ready'}>
      <div className="problem-rules"><p className="section-description" role="status">{checks.moves.length - pending - failed.length} / {checks.moves.length} {openingOnly ? 'sets' : 'moves'} checked · {total} {total === 1 ? 'finding' : 'findings'}{pending ? ` · ${pending} pending` : ''}{failed.length ? ` · ${failed.length} unavailable` : ''}</p>
        <HelpButton command="analysis.rules-open" title="Analysis rules" className="button subtle" disabled={!rules} disabledReason="Finish or cancel the current input or preview before editing analysis rules." onClick={() => controller.dispatch('analysis.rules-open')}><SlidersHorizontal size={14} />Analysis rules…</HelpButton></div>
      <div className="problem-searchbar">
        <label className="problem-search">Find performer, prop or text<input aria-label="Find a problem" value={filter.query} onChange={e => change({ query: e.target.value })} placeholder="Name, ID, set or rule" /></label>
      </div>
      <details className="problem-disclosure"><summary>Filters and sorting{filter.severity !== 'all' || filter.type !== 'all' || filter.moveId !== 'all' || filter.sort !== 'count' ? ' · customized' : ''}</summary>
        <div className="problem-filters">
        <label>Severity<select aria-label="Problem severity" value={filter.severity} onChange={e => change({ severity: e.target.value })}><option value="all">All severities</option><option value="danger">Danger</option><option value="warning">Warning</option></select></label>
        <label>Type<select aria-label="Problem type" value={filter.type} onChange={e => change({ type: e.target.value })}><option value="all">All types</option><option value="collision">Spacing</option><option value="stride">Stride</option><option value="clearance">Clearance</option></select></label>
        <label>Move<select aria-label="Problem move" value={filter.moveId} onChange={e => change({ moveId: e.target.value })}><option value="all">Whole show</option>{checks.moves.map(m => <option key={m.moveId} value={m.moveId}>{m.index ? `Move ${m.index} · ${project.sets[m.index].name}` : 'Opening set'}</option>)}</select></label>
        <label>Sort<select aria-label="Problem sort" value={filter.sort} onChange={e => change({ sort: e.target.value as ProblemFilter['sort'] })}><option value="count">Show count</option><option value="severity">Severity, then count</option><option value="move">Move, then count</option></select></label>
        </div>
      </details>
      {failed.length > 0 && <div role="alert"><p>{failed.map(m => `${findingLocation(project, m.index)}. ${m.error}`).join(' ')}</p><HelpButton title="Retry show checks" onClick={service.retry}>Retry unavailable moves</HelpButton></div>}
      {(pages > 1 || rows.length !== total) && <div className="problem-pagination"><span role="status">{rows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)}` : '0'} of {rows.length} matching findings</span><HelpButton title="Previous problems page" disabled={!currentPage} disabledReason="This is the first page." onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></HelpButton><span>{currentPage+1} / {pages}</span><HelpButton title="Next problems page" disabled={currentPage+1 >= pages} disabledReason="This is the final page." onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></HelpButton></div>}
      {!rows.length && <p className="section-description">{pending ? 'Waiting for the remaining checks. Current findings will appear here.' : total ? 'No findings match these filters.' : failed.length ? 'Resolve unavailable checks before relying on this result.' : project.clearanceRules ? 'No flags in the configured spacing, stride and footprint checks.' : 'No spacing or stride flags in this show.'}</p>}
      <ol className="problem-results" start={currentPage*PAGE_SIZE+1} aria-label="Matching problems">{rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map((row,i) => {
        const count=row.issue.atCount ?? 0, time=countToSeconds(project,count), name=findingName(row.issue,labels), danger=row.issue.severity==='danger';
        const location = findingLocation(project, row.index);
        const localCount = count - (row.index > 0 ? setStartCount(project, row.index - 1) : 0);
        const cue = Number.isInteger(localCount) ? `Count ${localCount}` : `Between counts ${Math.floor(localCount)} and ${Math.ceil(localCount)}`;
        const people = [...row.issue.performerIds, ...row.issue.propIds ?? []].map(id => labels.get(id) ?? id).join(', ');
        const identities = [row.issue.performerIds.length && `Performer IDs: ${row.issue.performerIds.join(', ')}`,
          row.issue.propIds?.length && `Prop IDs: ${row.issue.propIds.join(', ')}`].filter(Boolean).join(' · ');
        return <li key={`${row.moveId}:${currentPage}:${i}`}><HelpButton title={`Go to problem ${currentPage*PAGE_SIZE+i+1}: ${name}`} description={`${location} · ${row.issue.severity} ${row.issue.type} · show count ${fmt(count)} · ${time.toFixed(3)} seconds. ${row.issue.message}${row.issue.countRange ? ` Review show counts ${row.issue.countRange[0]}–${row.issue.countRange[1]}.` : ''} ${identities}. Pause here and highlight the affected participants.`} className="problem-result" onClick={() => reviewProblem(service,controller.store,row)}>
          <span className={`problem-severity ${row.issue.severity}`}>{danger ? <OctagonAlert size={14} /> : <TriangleAlert size={14} />}{row.issue.certainty === 'possible' ? 'Possible ' : ''}{findingType(row.issue)} · {findingQuantity(row.issue)} <span className="problem-participants">{people}</span></span>
          <strong className="problem-cue">{row.index > 0 ? `${cue} into Set ${row.index + 1}` : 'Opening set'}</strong>
          <span className="problem-count-context">{project.sets[row.index].name}</span>
          <span className="problem-technical problem-name">{name}</span>
          <span className="problem-technical">{location} · Show count {fmt(count)} · {time.toFixed(3)} s</span>
          <span className="problem-technical">{row.issue.message}</span>{row.issue.certainty && <span className="problem-bound problem-technical" data-problem-certainty={row.issue.certainty}>
            {row.issue.certainty === 'confirmed' ? 'Confirmed violation' : 'Possible violation · conservative bound'}<span className="problem-technical">{row.issue.measurement && ` · ${row.issue.measurement.converged ? `bound gap ≤ ${row.issue.measurement.tolerance} ${row.issue.measurement.unit}` : 'Bounds remain unresolved · review this interval'}`}
            {row.issue.countRange && <span data-problem-range> · Show counts {row.issue.countRange[1] - row.issue.countRange[0] < .001 ? String(row.issue.countRange[0]) : fmt(row.issue.countRange[0])}–{row.issue.countRange[1] - row.issue.countRange[0] < .001 ? String(row.issue.countRange[1]) : fmt(row.issue.countRange[1])}</span>}
          </span></span>}<small className="problem-technical">{identities}</small>
          <span className="problem-go">View on field <ArrowRight size={14} /></span>
        </HelpButton></li>;
      })}</ol>
      <details className="problem-disclosure problem-method"><summary>Analysis details</summary>
        <p className="microcopy">Project defaults · Minimum spacing {defaults.minimumSpacing} yd · Maximum stride {defaults.maximumStride} yd/count · {project.analysisRules?.sections?.length ?? 0} section overrides</p>
        <p className="microcopy">Detailed paths use conservative curve bounds with a target gap of 0.001 yd for spacing and 0.001 yd/count for peak stride. Displayed quantity bounds round outwards. Confirmed findings have a violating sampled witness; possible findings need review. Count ranges identify a known offending window or an unresolved candidate interval, not every encounter in a move.</p>
      </details>
    </div>
  </Modal>;
}
