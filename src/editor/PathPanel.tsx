import { useEffect, useState } from 'react';
import { Tooltip } from '../components/Tooltip';
import { Modal } from '../components/Modal';
import { FormattedNumberInput } from '../components/NumberField';
import { formatYards } from '../coordinates';
import { TravelCanvas } from './TravelCanvas';
import { travelHandles } from './pathAuthoring';
import { coordinateDescription, sampleProject, setStartCount, validateProject } from '../domain';
import { DEFAULT_SNAPPING } from '../snapping';
import { isCustomSurface } from '../surfaces';
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
  const stepYards = 5 / (project.snapping ?? DEFAULT_SNAPPING).steps, custom = isCustomSurface(project.field);
  const travel = movementLength(from, to, path), here = preview[performerId];
  const geometry = <label className="inline-label">Path<Tooltip name="Travel geometry" description="Straight, or curved with two handles you drag on the field."><select aria-label="Travel geometry" value={kind} onChange={e => setKind(e.target.value)}><option value="line">Straight</option><option value="cubic">Curved</option></select></Tooltip></label>;
  return <Modal title="Edit performer path" onClose={close} wide className="path-panel">
    <div className="path-fields"><p className="path-subject"><strong>{person.label}</strong>{person.name ? ` · ${person.name}` : ''}<span>Set {initial.index + 1} → {initial.index + 2} · {move.counts} counts · {custom ? `${formatYards(travel)} yd` : `${Number((travel / stepYards).toFixed(1))} steps`}</span></p>
    {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? 'The production or selection changed. Copy your draft, then cancel and reopen.' : error || submitError}</p>}
    {!error ? <>
      <TravelCanvas project={project} positions={preview} performerId={performerId} from={from} to={to} path={path} original={move.paths[performerId]} counts={move.counts} transition={move.transition}
        handles={travelHandles(from, to, path)} label="Travel path preview" onGesture={setGesture} toolbar={geometry}
        onHandle={(handle, point) => setValues(old => old.map((v, i) => i === (handle.kind === 'control1' ? 0 : 2) ? String(point.x) : i === (handle.kind === 'control1' ? 1 : 3) ? String(point.y) : v))} />
      <p className="path-hint">{kind === 'cubic' ? 'Drag the numbered handles to bend the path. Dashed is the saved path.' : 'Choose Curved to bend this path with handles.'}</p>
      <div className="path-scrub"><label className="inline-label">Count {formatTimelineCount(count)}<input aria-label="Preview path count" type="range" min={0} max={move.counts} step={0.01} value={count} onChange={e => setCount(Number(e.target.value))} /></label>
        <p role="status" aria-label="Path preview position"><strong>{person.label}</strong> {coordinateDescription(here, project.field, c.coordinateFormat)}<small>X {formatYards(here.x)}, Y {formatYards(here.y)} yd</small></p></div>
    </> : <p className="path-hint">Fix the handle position to see the path.</p>}
    {kind === 'cubic' && <div className="path-controls">{values.map((value, i) => <label className="form-label" key={i}>{`Handle ${i < 2 ? 1 : 2} · ${i % 2 ? 'Y' : 'X'} yd`}<Tooltip name={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} description="Type this handle's position in field yards. The preview updates without editing the production."><FormattedNumberInput aria-label={`Control ${i < 2 ? 1 : 2} ${i % 2 ? 'Y' : 'X'}`} step="0.1" min={0} max={i % 2 ? project.field.height : project.field.width} value={value} onChange={text => setValues(old => old.map((v, j) => j === i ? text : v))} /></Tooltip></label>)}</div>}
    </div><div className="modal-actions"><HelpButton title="Cancel path edit" className="button subtle" onClick={close}>Cancel</HelpButton><HelpButton title="Apply performer path" description="Save this path as one undo step." disabled={!changed || !!error || stale || gesture} disabledReason={error || (stale ? 'Cancel and reopen after the production changed.' : kind === 'line' ? 'Choose Curved and bend the path first.' : 'Change the path first.')} className="button primary" onClick={apply}>Apply path</HelpButton></div>
  </Modal>;
}
