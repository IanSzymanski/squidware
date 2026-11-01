import { sampleMovement, movementSvg } from '../movementPaths';
import { useMemo } from 'react';
import { useShowAnalysis, useShowChecks } from './ShowAnalysis';
import { useEditorSelector } from './react';
import { formatTimelineCount as fmt } from './timelineNavigation';
import { transitionInput } from '../analysis/input';
import type { AnalysisInput } from '../analysis/input';
import type { TransitionIssue } from '../types';
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
  const selected = checks.selected;
  const preview = checks.draft?.state;
  const paths = useMemo(() => {
    if (preview) return preview.status === 'ready' ? (checks.draft?.results ?? []).flatMap(r => marks(r.input,r.result.issues,true,r.input.moveId === checks.project.moves[checks.draft!.index]?.id)) : [];
    if (!selected || playing || Math.abs(count-(selected.issue.atCount ?? 0)) > 1e-6) return [];
    const input = transitionInput(checks.project, selected.index, checks.epoch);
    return input ? marks(input,[selected.issue],false) : [];
  }, [preview,checks.draft,selected,playing,count,checks.project,checks.epoch]);
  return <g className={preview ? 'problem-preview' : 'problem-selected'} pointerEvents="none" aria-hidden="true">{paths.map((track,i) => <g key={`${track.id}:${i}`} data-problem-performer={track.id}><path className="problem-path" d={movementSvg(track.from, track.to, track.path)} /><circle className="problem-ring" cx={track.point.x} cy={track.point.y} r="1.25" /></g>)}</g>;
}
export function ProblemFieldStatus() {
  const checks = useShowChecks(), service = useShowAnalysis();
  const count = useEditorSelector(s => s.playback.count), playing = useEditorSelector(s => s.playback.playing);
  if (checks.draft) {
    const draft = checks.draft;
    return <div className="problem-field-status" data-draft-analysis-status={draft.state.status} role="status">Drag preview · {draft.index === 0 ? 'outgoing move' : draft.index === checks.project.sets.length-1 ? 'incoming move' : 'both adjacent moves'} · {draft.state.status === 'pending' ? 'pending · old preview hidden' : draft.state.status === 'error' ? 'unavailable · release or cancel to return to committed checks' : `${draft.state.result?.issues.length ?? 0} flags`} · not committed</div>;
  }
  if (!checks.selected || playing || Math.abs(count-(checks.selected.issue.atCount ?? 0)) > 1e-6) return null;
  return <div className="problem-field-status" role="status">{checks.selected.issue.certainty === 'possible' ? 'Possible ' : ''}{checks.selected.issue.type === 'collision' ? 'Spacing' : 'Stride'} flag · Move {checks.selected.index} · Show {fmt(count)}<button className="button subtle" onClick={service.clearSelection}>Clear highlight</button></div>;
}
