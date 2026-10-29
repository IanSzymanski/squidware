import { useEffect, useMemo, useRef, useState } from 'react';
import { sampleProject, setStartCount } from '../domain';
import type { Point, Project } from '../types';
import { FieldDrawing } from '../components/Field2D';
import { fieldViewTransform } from '../components/fieldOrientation';
import { Modal } from '../components/Modal';
import { HelpButton } from './ControlHelp';
import { splitEasingDeviation, splitTransition, splitTransitionError } from './splitTransition';
import type { EditorController } from './useEditorController';
import './splitTransition.css';

export function SplitTransitionPanel({ controller: c }: { controller: EditorController }) {
  const [review] = useState(() => {
    const s = c.store.getState(), index = Math.max(0, s.selection.activeIndex - 1), project = s.project.present;
    return { project, index, move: project.moves[index], revision: s.project.revision, epoch: s.ui.projectEpoch, count: s.playback.count };
  });
  const { project, index, move } = review;
  const start = setStartCount(project, index), local = Math.round(review.count - start);
  const [count, setCount] = useState(String(local > 0 && local < move.counts ? local : Math.floor(move.counts / 2)));
  const [comparison, setComparison] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const splitCount = Number(count);
  const invalid = splitTransitionError(project, move.id, splitCount);
  const stale = c.store.getState().project.revision !== review.revision || c.store.getState().ui.projectEpoch !== review.epoch;
  const proposed = useMemo(() => invalid ? null : splitTransition(project, { moveId: move.id, count: splitCount, allowEasingChange: true }), [project, move.id, splitCount, invalid]);
  const deviation = useMemo(() => invalid ? null : splitEasingDeviation(project, index, splitCount), [project, index, splitCount, invalid]);
  const compareCount = comparison ?? splitCount;
  const original = proposed ? sampleProject(project, start + compareCount).positions : null;
  const after = proposed ? sampleProject(proposed, start + compareCount).positions : null;
  function preview(label: string, positions: Record<string, Point>, model: Project) {
    return <figure><figcaption>{label}</figcaption><svg role="img" aria-label={label} viewBox={`-5 -8 ${project.field.width + 10} ${project.field.height + 16}`}>
      <g transform={fieldViewTransform(project.field, c.preferences.value.fieldOrientation)}><FieldDrawing project={model} positions={positions} showLabels={project.performers.length <= 64} orientation={c.preferences.value.fieldOrientation} screen={{ scale: 3, bounds: { left: -15, top: -24, right: 315, bottom: 184 } }} /></g>
    </svg></figure>;
  }
  function apply() {
    if (!c.dispatch('set.split', { moveId: move.id, count: splitCount, allowEasingChange: accepted, revision: review.revision, epoch: review.epoch }))
      setError(c.store.getState().ui.toast || 'The production changed. Cancel and reopen this preview.');
  }
  return <Modal title="Split transition" onClose={() => c.setDialog(null)} wide className="split-transition">
    <p className="modal-intro">Set {index + 1}: <strong>{project.sets[index].name}</strong> → Set {index + 2}: <strong>{project.sets[index + 1].name}</strong>. Insert a picture sampled from all {project.performers.length} performers.</p>
    <label className="form-label">Split at move count<input ref={input} aria-label="Split at move count" type="number" min={1} max={move.counts - 1} step={1} value={count} aria-invalid={!!invalid} aria-describedby="split-count-policy" onChange={e => { setCount(e.target.value); setComparison(null); setAccepted(false); setError(''); }} /></label>
    <p id="split-count-policy" className="microcopy">Whole counts inside the {move.counts}-count move. Both parts need at least one count. Boundaries and fractional counts cannot create a set.</p>
    {invalid && <p className="field-error" role="alert">{invalid}</p>}
    {proposed && <>
      <p className="split-summary" role="status">{splitCount} + {move.counts - splitCount} counts · {move.tempo} BPM in both parts · {(move.counts * 60 / move.tempo).toFixed(3)} seconds total, unchanged. New picture at show count {start + splitCount}.</p>
      {move.transition === 'ease' ? <div className="split-warning" role="note"><strong>Easing changes between pictures.</strong><p>The new picture matches the original eased position. Each part will use constant speed, with a speed change at the split. The original ease in / out cannot be preserved by these two moves.</p><p>Largest position change: {deviation!.yards.toFixed(3)} yd, at move count {deviation!.count.toFixed(2)}. Total counts, tempo and duration stay the same.</p><HelpButton title="Show largest motion change" description="Compare the original and proposed positions at the count with the largest displacement." className="button subtle" onClick={() => setComparison(deviation!.count)}>Show largest change</HelpButton></div>
        : <p className="microcopy">Constant-speed movement is preserved across the whole transition.</p>}
      <div className="split-review-controls"><label className="form-label">Compare at move count {Number(compareCount.toFixed(2))}<input aria-label="Compare at move count" type="range" min={0} max={move.counts} step={.01} value={compareCount} onChange={e => setComparison(Number(e.target.value))} /></label><HelpButton title="Show split picture" description="Return the comparison to the sampled picture that will become the new set." className="button subtle" onClick={() => setComparison(null)}>Show split picture</HelpButton></div>
      <div className="split-fields">{preview('Original movement', original!, project)}{preview('After split', after!, proposed)}</div>
      <p className="microcopy">Existing notes stay with their sets; the new set has blank notes. Saved musical anchors and valid rehearsal bookmarks keep their show counts. Cancel leaves the production unchanged.</p>
      {move.transition === 'ease' && <label className="split-accept"><input aria-label="Accept easing change" type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>I accept the two constant-speed parts shown in the preview.</span></label>}
    </>}
    {(stale || error) && <p className="field-error" role="alert">{stale ? 'The production changed. Cancel and reopen this preview.' : error}</p>}
    <div className="modal-actions"><button className="button subtle" onClick={() => c.setDialog(null)}>Cancel</button><button aria-label="Apply transition split" className="button primary" disabled={!!invalid || stale || move.transition === 'ease' && !accepted} onClick={apply}>Apply split</button></div>
  </Modal>;
}
