import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { OctagonAlert, TriangleAlert } from 'lucide-react';
import type { Finding } from '../analysis/show';
import type { Project } from '../types';
import { placeTooltip } from '../components/tooltipPlacement';
import { uiScale } from '../uiScale';
import { useShowAnalysis, useShowChecks, reviewProblem } from './ShowAnalysis';
import { canReviewProblems } from './analysisCommands';
import { useEditorSelector, useEditorStore } from './react';
import { HelpButton } from './ControlHelp';
import { BADGE_CAP, GROUP_LIST_LIMIT, activeCluster, clusterBadge, clusterFindings, clusterName, clusterSeverity, findingName, performerLabels, problemClusters, rovingIndex, type PerformerLabels, type ProblemCluster } from './problemTrack';
const blocked = 'Finish or cancel the current input or preview before navigating to a problem.';
const SeverityIcon = ({ danger }: { danger: boolean }) => danger ? <OctagonAlert size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />;
/** Severity, move and destination, matching the Show-wide problems row; the name carries type, performers and count. */
function findingDescription(f: Finding, project: Project, labels: PerformerLabels) {
  return `${f.issue.severity === 'danger' ? 'Danger' : 'Warning'}${f.issue.certainty === 'possible' ? ' · possible' : ''} · Move ${f.index} · Set ${f.index} → ${f.index + 1} · ${project.sets[f.index]?.name ?? ''}. Pause at this count, select ${f.issue.performerIds.map(id => labels.get(id) ?? id).join(' and ')} and highlight their paths.`;
}
export function ProblemTimelineLabel() {
  const checks = useShowChecks(), store = useEditorStore();
  const pending = checks.moves.filter(m => m.status === 'pending').length, failed = checks.moves.filter(m => m.status === 'error').length;
  const available = useEditorSelector(s => canReviewProblems(s) && !s.ui.dialog);
  const total = checks.moves.reduce((n,m) => n+m.issues.length,0);
  return <span className="problem-track-label"><HelpButton command="analysis.problems-open" title="Show-wide problems" aria-label={`Show-wide problems: ${pending ? 'checking moves' : failed ? 'some moves unavailable' : `${total} finding${total === 1 ? '' : 's'}`}`} className="problem-count-badge" disabled={!available} disabledReason="Finish or cancel the current input or preview before reviewing problems." state={`${total} current findings · ${pending} pending moves · ${failed} unavailable moves`} description="Open every spacing and stride finding with filters, count navigation and Analysis rules. The marker row groups nearby findings." onClick={() => store.dispatch('analysis.problems-open')}><TriangleAlert size={12} aria-hidden="true" />{pending ? '…' : failed ? '!' : total}</HelpButton></span>;
}
/** One Tab stop (roving tabindex): Left/Right/Home/End move between markers, Enter/Space go to a finding or list a group. */
export function ProblemTimeline({ start, span, width }: { start: number; span: number; width: number }) {
  const checks = useShowChecks(), service = useShowAnalysis(), store = useEditorStore();
  const available = useEditorSelector(canReviewProblems);
  // Focus mode, the workspace, the side panel and the count window or width move or hide the marker a group list hangs
  // from: a list opened in another place is closed.
  const place = `${useEditorSelector(s => `${s.ui.focusMode}:${s.ui.workspace}:${s.ui.castPanelOpen}`)}:${start}:${span}:${width}`;
  const labels = useMemo(() => performerLabels(checks.project), [checks.project]);
  const clusters = useMemo(() => problemClusters(checks.moves,start,span,width),[checks.moves,start,span,width]);
  const track = useRef<HTMLDivElement>(null), opener = useRef<HTMLElement | null>(null), focused = useRef<Element | null>(null), hint = useId();
  const [remembered, setRemembered] = useState<{ key: string; count: number } | null>(null), [expanded, setExpanded] = useState<{ key: string; place: string } | null>(null);
  const active = activeCluster(clusters, remembered), open = expanded?.place === place ? clusters.find(c => c.key === expanded.key) : undefined;
  useEffect(() => { if (expanded && !open) setExpanded(null); }, [expanded, open]);
  // Regrouping (a review switching the side panel, a resize, a worker reply, a scrolled count window) can remove the
  // focused marker, and a layout change or resize closes the focused list. In that commit, and only while focus fell to
  // the document, keyboard focus moves to the remembered marker. A recheck that empties the row (a keyboard edit from it)
  // keeps the claim until its results arrive, unless the user types, presses or focuses anything first; any other empty
  // row lets focus go, so the row never takes it back later. No other commit makes the row do work.
  const rechecking = checks.moves.some(m => m.status === 'pending');
  useLayoutEffect(() => {
    if (!focused.current || focused.current.isConnected) return;
    const free = !document.activeElement || document.activeElement === document.body;
    if (!clusters.length && rechecking && free) {
      const events = ['keydown', 'pointerdown', 'focusin'] as const, forget = () => { focused.current = null; stop(); };
      const stop = () => { for (const type of events) document.removeEventListener(type, forget, true); };
      for (const type of events) document.addEventListener(type, forget, true);
      return stop;
    }
    focused.current = null;
    if (free) track.current?.querySelectorAll<HTMLElement>('.problem-marker')[active]?.focus();
  }, [clusters, open, rechecking]);
  if (!clusters.length) return <div className="problem-track" />;
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target as Element).classList.contains('problem-marker') || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = rovingIndex(event.key, active, clusters.length, 'horizontal');
    if (next === null) return;
    event.preventDefault(); track.current?.querySelectorAll<HTMLElement>('.problem-marker')[next]?.focus();
  }
  // A pointer press outside the row and list ends the row's claim on focus; a resize closes the list but keeps it.
  function close(refocus: boolean, outside = false) { if (outside) focused.current = null; setExpanded(null); if (refocus && opener.current?.isConnected) opener.current.focus(); }
  // Focus within the row or its list (React focus events bubble out of the list's portal). Focus that leaves for the
  // document while its control remains (a click on empty space, a scripted blur) is no longer the row's to restore.
  return <div ref={track} className="problem-track" role="toolbar" aria-label="Problem markers" aria-describedby={hint} onKeyDown={keyDown}
    onFocus={event => { focused.current = event.target; }} onBlur={event => { const from = event.target, to = event.relatedTarget;
      if (to ? !track.current?.contains(to) && !to.closest('.problem-cluster-list') : from.isConnected && document.activeElement !== from) focused.current = null; }}>
    <span id={hint} className="sr-only">Arrow keys, Home and End move between markers. Enter goes to a finding or lists a group.</span>
    {clusters.map((c,i) => { const single = c.size === 1 ? clusterFindings(c)[0] : undefined;
      return <HelpButton key={c.key} title={clusterName(c, labels)} tabIndex={i === active ? 0 : -1} disabled={!available} disabledReason={blocked}
        description={single ? findingDescription(single, checks.project, labels) : `${clusterSeverity(c)}. Lists ${c.size > GROUP_LIST_LIMIT ? `the first ${GROUP_LIST_LIMIT} of ${c.size}` : `all ${c.size}`} findings; choose one to pause at its count, select its performers and highlight their paths.`}
        className={`problem-marker ${c.danger ? 'danger' : 'warning'}${single ? '' : ' problem-cluster'}`} aria-haspopup={single ? undefined : 'menu'} aria-expanded={single ? undefined : open === c}
        style={{ left: c.left, width: c.width }} onFocus={() => setRemembered({ key: c.key, count: c.first })}
        onClick={event => { if (single) { reviewProblem(service, store, single); return; } opener.current = event.currentTarget; setExpanded(open === c ? null : { key: c.key, place }); }}>
        {single ? <SeverityIcon danger={!!c.danger} /> : <span className={`problem-marker-count${c.size >= BADGE_CAP ? ' problem-marker-count--capped' : ''}`}>{clusterBadge(c.size)}</span>}
      </HelpButton>; })}
    {open && <ProblemClusterList key={open.key} cluster={open} labels={labels} available={available} anchor={opener} onClose={close}
      onChoose={finding => { close(true); if (finding) reviewProblem(service, store, finding); else store.dispatch('analysis.problems-open'); }} />}
  </div>;
}
/** Every finding in a group as a menu above its marker. Up/Down/Home/End move, Enter chooses and Escape returns to the marker;
 * Tab closes the list and continues from the marker, as from a menu button. Focus leaving for anything else closes it. */
function ProblemClusterList({ cluster, labels, available, anchor, onClose, onChoose }: { cluster: ProblemCluster; labels: PerformerLabels; available: boolean; anchor: { current: HTMLElement | null }; onClose: (refocus: boolean, outside?: boolean) => void; onChoose: (finding: Finding | null) => void }) {
  // Very dense groups list their first findings and hand the rest to Show-wide problems, which pages through all of them.
  const findings = useMemo(() => clusterFindings(cluster, GROUP_LIST_LIMIT), [cluster]), more = cluster.size - findings.length, items = findings.length + Number(more > 0);
  const panel = useRef<HTMLDivElement>(null), heading = useId(), [index, setIndex] = useState(0), current = Math.min(index, items - 1);
  const latest = useRef(onClose); latest.current = onClose;
  useLayoutEffect(() => {
    const place = () => {
      const element = panel.current, trigger = anchor.current;
      if (!element || !trigger) return;
      element.style.maxHeight = '';
      const { clientWidth: width, clientHeight: height } = document.documentElement;
      const p = placeTooltip(trigger.getBoundingClientRect(), element.getBoundingClientRect(), { width, height }, { scale: uiScale(), minHeight: 96 });
      Object.assign(element.style, { left: `${p.left}px`, top: `${p.top}px`, maxHeight: p.maxHeight === undefined ? '' : `${p.maxHeight}px` });
    };
    place(); panel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) latest.current(false, true); };
    const resize = () => latest.current(false);
    document.addEventListener('pointerdown', outside, true); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', resize); };
  }, [anchor]);
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
    // Tab leaves from the group marker, as from a menu button.
    if (event.key === 'Tab') { onClose(true); return; }
    const next = rovingIndex(event.key, current, items, 'vertical');
    if (next === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault(); event.stopPropagation(); panel.current?.querySelectorAll<HTMLElement>('[role=menuitem]')[next]?.focus();
  }
  // Items carry their severity and move as text instead of hover help, which would cover the next items. The escape scope
  // keeps workspace Escape (focus mode, tucked-panel overlays) from acting before the list closes.
  return createPortal(<div ref={panel} className="problem-cluster-list" data-escape-scope="" onKeyDown={keyDown}
    onBlur={event => { const to = event.relatedTarget; if (to && !panel.current?.contains(to) && !anchor.current?.contains(to)) onClose(false); }}>
    <p id={heading}><strong>{clusterName(cluster, labels)}</strong> · {clusterSeverity(cluster)}</p>
    {!available && <p className="tooltip-reason">Unavailable: {blocked}</p>}
    <div role="menu" aria-labelledby={heading}>{findings.map((f, i) => <button key={i} type="button" role="menuitem" tabIndex={i === current ? 0 : -1} aria-disabled={!available || undefined}
      className={`problem-cluster-item ${f.issue.severity}`} onFocus={() => setIndex(i)} onClick={() => { if (available) onChoose(f); }}>
      <SeverityIcon danger={f.issue.severity === 'danger'} /><span>{findingName(f.issue, labels)}</span><small>{f.issue.severity === 'danger' ? 'Danger' : 'Warning'}{f.issue.certainty === 'possible' ? ' · possible' : ''} · move {f.index}</small></button>)}
      {more > 0 && <button type="button" role="menuitem" tabIndex={current === findings.length ? 0 : -1} aria-disabled={!available || undefined} className="problem-cluster-item problem-cluster-more" onFocus={() => setIndex(findings.length)} onClick={() => { if (available) onChoose(null); }}>
        <span>{more} more · open Show-wide problems</span></button>}</div>
  </div>, document.body);
}
