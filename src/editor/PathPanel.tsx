import { useEffect, useState } from 'react';
import { Tooltip } from '../components/Tooltip';
import { Modal } from '../components/Modal';
import { FormattedNumberInput } from '../components/NumberField';
import { formatYards } from '../coordinates';
import { TravelCanvas } from './TravelCanvas';
import { travelHandles } from './pathAuthoring';
import { sampleProject, setStartCount, validateProject } from '../domain';
import { movementLength } from '../movementPaths';
import { HelpButton } from './ControlHelp';
import { editMovementPath, type PathEdit } from './pathEditing';
import { formatTimelineCount } from './timelineNavigation';
import type { EditorController } from './useEditorController';
import './paths.css';

export function PathPanel({ controller: c }: { controller: EditorController }) {
  const [initial] = useState(() => {
    const project = c.project, index = c.index - 1, performerId = c.selectedIds[0], move = project.moves[index];
    const from = project.sets[index].positions[performerId], to = project.sets[index + 1].positions[performerId], segment = move.paths[performerId]?.segments[0];
    return { project, index, performerId, move, from, to, segment, revision: c.store.getState().project.revision, epoch: c.projectEpoch };
  });
  const { project, from, to, move, performerId, segment } = initial;
  const [kind, setKind] = useState(segment?.kind === 'cubic' ? 'cubic' : 'line');
  const [values, setValues] = useState(() => segment?.kind === 'cubic'
    ? [segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y].map(String)
    : [from.x + (to.x - from.x) / 3, from.y + (to.y - from.y) / 3, from.x + (to.x - from.x) * 2 / 3, from.y + (to.y - from.y) * 2 / 3].map(String));
  const [count, setCount] = useState(move.counts / 2), [submitError, setSubmitError] = useState(''), [gesture, setGesture] = useState(false);
  const controls = kind === 'cubic' ? { control1: { x: Number(values[0]), y: Number(values[1]) }, control2: { x: Number(values[2]), y: Number(values[3]) } } : null;
  const request: PathEdit = { moveId: move.id, performerId, controls, revision: initial.revision, epoch: initial.epoch };
  let error = '', candidate = project;
  try {
    if (controls && values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Error('Enter a finite number for each control coordinate.');
    candidate = editMovementPath(project, request);
    validateProject(candidate);
  } catch (e) { error = (e as Error).message; }
  const rawPath = candidate.moves[initial.index].paths[performerId];
  const path = rawPath ? { segments: rawPath.segments.map(s => ({ ...s, id: segment?.id ?? 'path-preview' })) } : undefined;
  const changed = kind === 'line' ? !!project.moves[initial.index].paths[performerId]
    : segment?.kind !== 'cubic' || JSON.stringify(controls) !== JSON.stringify({ control1: segment.control1, control2: segment.control2 });
  const state = c.store.getState();
  const stale = state.project.revision !== initial.revision || c.projectEpoch !== initial.epoch || c.index !== initial.index + 1 || c.selectedIds.length !== 1 || c.selectedIds[0] !== performerId;
  useEffect(() => { c.setPendingDraft(changed, 'movement-path'); return () => c.setPendingDraft(false, 'movement-path'); }, [changed, c.setPendingDraft]);
  function close() { c.setPendingDraft(false, 'movement-path'); c.setDialog(null); }
  function apply() {
    if (error || stale || !changed || gesture) return;
    c.setPendingDraft(false, 'movement-path');
    if (c.dispatch('path.save', request) !== true) { c.setPendingDraft(changed, 'movement-path'); setSubmitError(c.store.getState().ui.toast || 'Cancel and reopen to review the current move.'); }
  }
  const preview = sampleProject(candidate, setStartCount(candidate, initial.index) + count).positions;
  const person = project.performers.find(p => p.id === performerId)!;
  return <Modal title="Edit performer path" onClose={close} wide className="path-panel">
    <div className="path-fields"><p className="modal-intro">{person.label} · {project.sets[initial.index].name} → {project.sets[initial.index + 1].name} · {move.counts} counts. Endpoints follow the two sets; other performers keep their paths.</p>
    <label className="form-label">Travel geometry<Tooltip name="Travel geometry" description="Choose a straight line or a cubic curve with two control points."><select aria-label="Travel geometry" value={kind} onChange={e => setKind(e.target.value)}><option value="line">Straight line</option><option value="cubic">Cubic Bézier</option></select></Tooltip></label>
    {kind === 'cubic' && <div className="path-controls">{values.map((value, i) => <label className="form-label" key={i}>{`Control ${i < 2 ? 1 : 2} · ${i % 2 ? 'Y' : 'X'} yards`}<Tooltip name={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} description="Change this Bézier control coordinate in field yards. Preview updates without editing the production."><FormattedNumberInput aria-label={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} step="0.1" min={0} max={i % 2 ? project.field.height : project.field.width} value={value} onChange={text => setValues(old => old.map((v, j) => j === i ? text : v))} /></Tooltip></label>)}</div>}
    <p className="microcopy">Start ({formatYards(from.x)}, {formatYards(from.y)}) · End ({formatYards(to.x)}, {formatYards(to.y)}) yards. Control points stay inside the field. Bézier parameter advances with count{move.transition === 'ease' ? ' using ease in / out' : ' linearly'}; curved speed varies. Background checks use conservative curve bounds; review confirmed and possible findings in Problems.</p>
    {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? 'The production or selection changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
    {!error && <>
      <TravelCanvas project={project} positions={preview} performerId={performerId} from={from} to={to} path={path} original={move.paths[performerId]} counts={move.counts} transition={move.transition}
        handles={travelHandles(from, to, path)} label="Travel path preview" onGesture={setGesture}
        onHandle={(handle, point) => setValues(old => old.map((v, i) => i === (handle.kind === 'control1' ? 0 : 2) ? String(point.x) : i === (handle.kind === 'control1' ? 1 : 3) ? String(point.y) : v))} />
      <label className="form-label">Preview local count · {formatTimelineCount(count)}<input aria-label="Preview path count" type="range" min={0} max={move.counts} step={0.01} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <p role="status" aria-label="Path preview position">{person.label}: X {formatYards(preview[performerId].x)}, Y {formatYards(preview[performerId].y)} yd · travel {formatYards(movementLength(from, to, path))} yd. Dashed: saved path. Solid: preview. Ring: sampled position. Count dots use the playback evaluator.</p>
    </>}
    <p className="microcopy">Apply records one undo action. Cancel or Escape leaves the production unchanged. Curves save in format v5. For multi-interval drawing, use Draw performer path from the Inspector after canceling this editor. Splitting a curved move or changing its preceding set requires removing its curves first.</p>
    </div><div className="modal-actions"><HelpButton title="Cancel path edit" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title="Apply performer path" description="Save the reviewed travel geometry as one undo action." disabled={!changed || !!error || stale || gesture} disabledReason={error || (stale ? 'Cancel and reopen after the production changed.' : 'Change the travel geometry first.')} className="button primary" onClick={apply}>Apply path · one undo</HelpButton></div>
  </Modal>;
}
