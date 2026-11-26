import { sampleMovement, movementSvg } from '../movementPaths';
import { useMemo } from 'react';
import { useShowAnalysis, useShowChecks } from './ShowAnalysis';
import { useEditorSelector } from './react';
import { formatTimelineCount as fmt } from './timelineNavigation';
import { transitionInput } from '../analysis/input';
import type { AnalysisInput } from '../analysis/input';
import type { TransitionIssue } from '../types';
import { sampleProject } from '../domain';
import { footprintDiameter, performerShape, propShape } from '../analysis/clearance';
import { findingType } from './problemTrack';
import './problems.css';

function marks(input: AnalysisInput, issues: TransitionIssue[], draft: boolean, outgoing = false) {
  // A performer/path is drawn once even when hundreds of pairs involve it.
  const ids = new Set(issues.flatMap(i => i.performerIds));
  const localCount = draft ? (outgoing ? 0 : input.counts) : Math.max(0, Math.min(input.counts, (issues[0]?.atCount ?? input.startCount) - input.startCount));
  return input.tracks.filter(track => ids.has(track.id)).map(track => ({ ...track, point: sampleMovement(track.from, track.to, track.path, localCount, input.counts, input.transition) }));
}
export function ProblemOverlay() {
  const checks = useShowChecks();
  const count = useEditorSelector(s => s.playback.count), playing = useEditorSelector(s => s.playback.playing);
  const showPreviewPaths = useEditorSelector(s=>s.ui.formationPreview?.scatterShowTravel!==false);
  const selected = checks.selected;
  const preview = checks.draft?.state;
  const enabled = !!selected && !playing && Math.abs(count - (selected.issue.atCount ?? 0)) <= 1e-6;
  const paths = useMemo(() => {
    if (preview && !showPreviewPaths) return [];
    if (preview) return preview.status === 'ready' ? (checks.draft?.results ?? []).flatMap(r => marks(r.input,r.result.issues,true,r.input.moveId === checks.project.moves[checks.draft!.index]?.id)) : [];
    if (!selected || !enabled || selected.issue.type === 'clearance') return [];
    const input = transitionInput(checks.project, selected.index, checks.epoch);
    return input ? marks(input,[selected.issue],false) : [];
  }, [showPreviewPaths,preview,checks.draft,selected,enabled,checks.project,checks.epoch]);
  const clearance = useMemo(() => {
    const rules = checks.project.clearanceRules;
    if (!enabled || selected?.issue.type !== 'clearance' || !rules) return [];
    const sample = sampleProject(checks.project, count);
    return [
      ...selected.issue.performerIds.map(id => ({ id, prop: false, ...sample.positions[id], ...performerShape(rules.performer, sample.facings?.[id]) })),
      ...(sample.staging ?? []).filter(prop => selected.issue.propIds?.includes(prop.id)).map(prop => ({ ...prop, ...propShape(prop, prop.footprint), prop: true })),
    ];
  }, [checks.project, selected, enabled, count]);
  return <g className={preview ? 'problem-preview' : 'problem-selected'} pointerEvents="none" aria-hidden="true">
    {paths.map((track,i) => <g key={`${track.id}:${i}`} data-problem-performer={track.id}><path className="problem-path" d={movementSvg(track.from, track.to, track.path)} /><circle className="problem-ring" cx={track.point.x} cy={track.point.y} r="1.25" /></g>)}
    {clearance.map(({ id, prop, shape, x, y, width, depth, angle }) => <g key={id} data-problem-prop={prop ? id : undefined} data-problem-performer={prop ? undefined : id}
      className={`clearance-outline ${selected?.issue.severity === 'warning' ? 'clearance-outline--warning' : ''}${selected?.issue.certainty === 'possible' ? ' clearance-outline--possible' : ''}`} transform={`translate(${x} ${y}) rotate(${-angle})`}>
      {shape === 'circle' ? <circle className="problem-ring" r={footprintDiameter({ width, depth }) / 2} />
        : <rect className="problem-ring" x={-width / 2} y={-depth / 2} width={width} height={depth} />}
    </g>)}
  </g>;
}
export function ProblemFieldStatus() {
  const checks = useShowChecks(), service = useShowAnalysis();
  const count = useEditorSelector(s => s.playback.count), playing = useEditorSelector(s => s.playback.playing);
  const scatter = useEditorSelector(s=>!!s.ui.formationPreview?.scatter);
  if (checks.draft) {
    const draft = checks.draft;
    // Plain words for what the check of this unapplied picture found; the attribute carries the state for automation.
    const found = draft.state.result?.issues.length ?? 0, when = scatter ? 'if applied' : 'if dropped here';
    return <div className="problem-field-status" data-draft-analysis-status={draft.state.status} role="status">{draft.state.status === 'pending' ? 'Preview · checking…'
      : draft.state.status === 'error' ? 'Preview · cannot be checked until it is applied'
      : found ? `Preview · ${found} ${found === 1 ? 'problem' : 'problems'} ${when}` : `Preview · no problems ${when}`}</div>;
  }
  if (!checks.selected || playing || Math.abs(count-(checks.selected.issue.atCount ?? 0)) > 1e-6) return null;
  const { issue, index } = checks.selected;
  const label = issue.type === 'clearance' && issue.certainty === 'confirmed' ? issue.severity === 'danger' ? 'Footprint overlap' : 'Clearance warning'
    : `${issue.certainty === 'possible' ? 'Possible ' : ''}${findingType(issue)} flag`;
  return <div className="problem-field-status" role="status">{label} · {index ? `Move ${index}` : 'Opening set'} · Show {fmt(count)}<button className="button subtle" onClick={service.clearSelection}>Clear highlight</button></div>;
}
