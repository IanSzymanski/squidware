import { useEffect, useState } from 'react';
import { Tooltip } from '../components/Tooltip';
import { Modal } from '../components/Modal';
import { FieldDrawing } from '../components/Field2D';
import { sampleProject, setStartCount, validateProject } from '../domain';
import { movementSvg, movementLength } from '../movementPaths';
import { HelpButton } from './ControlHelp';
import { editMovementPath, type PathEdit } from './pathEditing';
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
  const [count, setCount] = useState(move.counts / 2), [submitError, setSubmitError] = useState('');
  const controls = kind === 'cubic' ? { control1: { x: Number(values[0]), y: Number(values[1]) }, control2: { x: Number(values[2]), y: Number(values[3]) } } : null;
  const request: PathEdit = { moveId: move.id, performerId, controls, revision: initial.revision, epoch: initial.epoch };
  let error = '', candidate = project;
  try {
    if (controls && values.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Error('Enter a finite number for each control coordinate.');
    candidate = editMovementPath(project, request);
    validateProject(candidate);
  } catch (e) { error = (e as Error).message; }
  const path = candidate.moves[initial.index].paths[performerId];
  const changed = kind === 'line' ? !!project.moves[initial.index].paths[performerId]
    : segment?.kind !== 'cubic' || JSON.stringify(controls) !== JSON.stringify({ control1: segment.control1, control2: segment.control2 });
  const state = c.store.getState();
  const stale = state.project.revision !== initial.revision || c.projectEpoch !== initial.epoch || c.index !== initial.index + 1 || c.selectedIds.length !== 1 || c.selectedIds[0] !== performerId;
  useEffect(() => { c.setPendingDraft(changed, 'movement-path'); return () => c.setPendingDraft(false, 'movement-path'); }, [changed, c.setPendingDraft]);
  function close() { c.setPendingDraft(false, 'movement-path'); c.setDialog(null); }
  function apply() {
    if (error || stale || !changed) return;
    c.setPendingDraft(false, 'movement-path');
    if (c.dispatch('path.save', request) !== true) { c.setPendingDraft(changed, 'movement-path'); setSubmitError(c.store.getState().ui.toast || 'Cancel and reopen to review the current move.'); }
  }
  const preview = sampleProject(candidate, setStartCount(candidate, initial.index) + count).positions;
  const person = project.performers.find(p => p.id === performerId)!;
  return <Modal title="Edit performer path" onClose={close} wide className="path-panel">
    <div className="path-fields"><p className="modal-intro">{person.label} · {project.sets[initial.index].name} → {project.sets[initial.index + 1].name} · {move.counts} counts. Endpoints follow the two sets; other performers keep their paths.</p>
    <label className="form-label">Travel geometry<Tooltip name="Travel geometry" description="Choose a straight line or a cubic curve with two control points."><select aria-label="Travel geometry" value={kind} onChange={e => setKind(e.target.value)}><option value="line">Straight line</option><option value="cubic">Cubic Bézier</option></select></Tooltip></label>
    {kind === 'cubic' && <div className="path-controls">{values.map((value, i) => <label className="form-label" key={i}>{`Control ${i < 2 ? 1 : 2} · ${i % 2 ? 'Y' : 'X'} yards`}<Tooltip name={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} description="Change this Bézier control coordinate in field yards. Preview updates without editing the production."><input aria-label={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} type="number" step="0.1" min={0} max={i % 2 ? project.field.height : project.field.width} value={value} onChange={e => setValues(old => old.map((v, j) => j === i ? e.target.value : v))} /></Tooltip></label>)}</div>}
    <p className="microcopy">Start ({from.x.toFixed(3)}, {from.y.toFixed(3)}) · End ({to.x.toFixed(3)}, {to.y.toFixed(3)}) yards. Control points stay inside the field. Bézier parameter advances with count{move.transition === 'ease' ? ' using ease in / out' : ' linearly'}; curved speed varies. Spacing and stride checks are unavailable for moves containing curves.</p>
    {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? 'The production or selection changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
    {!error && <>
      <svg className="path-preview" viewBox={`-7 -8 114 ${project.field.height + 16}`} role="img" aria-label="Travel path preview">
        <FieldDrawing project={project} positions={preview} selectedIds={[performerId]} showLabels={false} />
        <path className="path-original" d={movementSvg(from, to, move.paths[performerId])} />
        <path className="path-proposed" d={movementSvg(from, to, path)} />
        {controls && <g className="path-polygon"><path d={`M${from.x} ${from.y}L${controls.control1.x} ${controls.control1.y}L${controls.control2.x} ${controls.control2.y}L${to.x} ${to.y}`} />{[controls.control1, controls.control2].map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="1" /><text x={p.x + 1.5} y={p.y - 1}>{i + 1}</text></g>)}</g>}
      </svg>
      <label className="form-label">Preview local count · {count.toFixed(2)}<input aria-label="Preview path count" type="range" min={0} max={move.counts} step={0.01} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
      <p role="status" aria-label="Path preview position">{person.label}: X {preview[performerId].x.toFixed(3)}, Y {preview[performerId].y.toFixed(3)} yd · travel {movementLength(from, to, path).toFixed(3)} yd. Dashed: saved path. Solid: preview. Ring: sampled position.</p>
    </>}
    <p className="microcopy">Apply records one undo action. Cancel or Escape leaves the production unchanged. Curves save in format v5. Splitting a curved move or changing its preceding set requires removing its curves first.</p>
    </div><div className="modal-actions"><HelpButton title="Cancel path edit" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title="Apply performer path" description="Save the reviewed travel geometry as one undo action." disabled={!changed || !!error || stale} disabledReason={error || (stale ? 'Cancel and reopen after the production changed.' : 'Change the travel geometry first.')} className="button primary" onClick={apply}>Apply path · one undo</HelpButton></div>
  </Modal>;
}
