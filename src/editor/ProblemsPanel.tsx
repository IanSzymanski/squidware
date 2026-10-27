import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';
import { Modal } from '../components/Modal';
import { countToSeconds, setStartCount } from '../domain';
import { DEFAULT_ANALYSIS_RULES } from '../analysis/rules';
import { defaultProblemFilter, findings, type ProblemFilter } from '../analysis/show';
import { HelpButton } from './ControlHelp';
import { reviewProblem, useShowAnalysis, useShowChecks } from './ShowAnalysis';
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
  function change(update: Partial<ProblemFilter>) { setFilter({ ...filter, ...update }); setPage(0); }
  return <Modal title="Show-wide problems" wide onClose={() => controller.setDialog(null)}>
    <div className="problems-panel" data-show-analysis-status={pending ? 'pending' : failed.length ? 'error' : 'ready'}>
      <p className="section-description" role="status">{checks.moves.length - pending - failed.length} / {checks.moves.length} moves checked · {total} findings{pending ? ` · ${pending} pending / stale moves hidden` : ''}{failed.length ? ` · ${failed.length} unavailable` : ''}. Geometric spacing and stride checks.</p>
      <p className="microcopy">Project defaults: minimum {defaults.minimumSpacing} yd · maximum {defaults.maximumStride} yd/count. {project.analysisRules?.sections?.length ?? 0} section overrides. Each finding explains the applied section/direction rule; unknown directions use base rules.</p>
      <div className="problem-filters">
        <label>Severity<select aria-label="Problem severity" value={filter.severity} onChange={e => change({ severity: e.target.value })}><option value="all">All severities</option><option value="danger">Danger</option><option value="warning">Warning</option></select></label>
        <label>Type<select aria-label="Problem type" value={filter.type} onChange={e => change({ type: e.target.value })}><option value="all">All types</option><option value="collision">Spacing</option><option value="stride">Stride</option></select></label>
        <label>Move<select aria-label="Problem move" value={filter.moveId} onChange={e => change({ moveId: e.target.value })}><option value="all">Whole show</option>{project.moves.map((m,i) => <option key={m.id} value={m.id}>Move {i+1} · {project.sets[i+1].name}</option>)}</select></label>
        <label>Sort<select aria-label="Problem sort" value={filter.sort} onChange={e => change({ sort: e.target.value as ProblemFilter['sort'] })}><option value="count">Show count</option><option value="severity">Severity, then count</option><option value="move">Move, then count</option></select></label>
        <label className="problem-search">Find performer or text<input aria-label="Find a problem" value={filter.query} onChange={e => change({ query: e.target.value })} placeholder="Label, performer ID, set or rule" /></label>
      </div>
      {failed.length > 0 && <div role="alert"><p>{failed.map(m => `Move ${m.index}: ${m.error}`).join(' ')}</p><HelpButton title="Retry show checks" onClick={service.retry}>Retry unavailable moves</HelpButton></div>}
      <div className="problem-pagination"><span role="status">{rows.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)}` : '0'} of {rows.length} matching findings</span><HelpButton title="Previous problems page" disabled={!currentPage} disabledReason="This is the first page." onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></HelpButton><span>{currentPage+1} / {pages}</span><HelpButton title="Next problems page" disabled={currentPage+1 >= pages} disabledReason="This is the final page." onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></HelpButton></div>
      {!rows.length && <p className="section-description">{pending ? 'Waiting for the remaining move checks. Current findings will appear here.' : total ? 'No findings match these filters.' : failed.length ? 'Resolve unavailable checks before relying on this result.' : 'No spacing or stride flags in this show.'}</p>}
      <ol className="problem-results" start={currentPage*PAGE_SIZE+1} aria-label="Matching problems">{rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE).map((row,i) => {
        const count=row.issue.atCount ?? 0, time=countToSeconds(project,count);
        return <li key={`${row.moveId}:${currentPage}:${i}`}><HelpButton title={`Go to problem ${currentPage*PAGE_SIZE+i+1}`} description={`Move ${row.index}, ${row.issue.severity} ${row.issue.type}, show count ${fmt(count)}, ${time.toFixed(3)} seconds. ${row.issue.message} Performer IDs ${row.issue.performerIds.join(', ')}. Pause here, select performers and highlight their paths.`} className="problem-result" onClick={() => reviewProblem(service,controller.store,row)}>
          <span className={`problem-severity ${row.issue.severity}`}><TriangleAlert size={14} />{row.issue.severity} · {row.issue.type === 'collision' ? 'spacing' : 'stride'}</span>
          <strong>Move {row.index} · Set {row.index} → {row.index+1} · {project.sets[row.index].name}</strong>
          <span>Show {fmt(count)} · Move {fmt(count-setStartCount(project,row.index-1))} · {time.toFixed(3)} s</span>
          <span>{row.issue.message}</span><small>Performer IDs: {row.issue.performerIds.join(', ')}</small>
        </HelpButton></li>;
      })}</ol>
    </div>
  </Modal>;
}
