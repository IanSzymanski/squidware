import { useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { FieldDrawing } from '../components/Field2D';
import { fieldViewTransform } from '../components/fieldOrientation';
import { Modal } from '../components/Modal';
import { StagingFootprints } from '../components/StagingFootprints';
import { uid } from '../domain';
import { frontEnsembleCatalog, isFrontEnsembleModel, type FrontEnsembleModel } from '../frontEnsemble';
import { sampleStaging, STAGING_LIMITS, validateStagingPoses, type StagingObject, type StagingPose } from '../staging';
import { surfaceNumber, surfaceUnits, unitInYards, yardsInUnit } from '../surfaces';
import type { EditorController } from './useEditorController';
import './staging.css';

const dimensions = [['x', 'Center X'], ['y', 'Center Y'], ['width', 'Width'], ['depth', 'Depth'], ['height', 'Height']] as const;
type Dimension = (typeof dimensions)[number][0];
type NumericField = Dimension | 'angle' | 'start' | 'end';
type Values = Record<NumericField, string>;
interface Draft {
  object: StagingObject; source: StagingPose; values: Values; initial: Values; visible: boolean;
  create: boolean; setId: string; revision: number; epoch: number;
}

export function StagingPanel({ controller: c }: { controller: EditorController }) {
  const { project, activeSet, index, store, dispatch } = c;
  const objects = project.stagingObjects ?? [];
  const field = project.field, unit = surfaceUnits(field);
  const orientation = c.preferences.value.fieldOrientation;
  const counts = project.moves[index - 1]?.counts ?? 0;
  const [selectedId, setSelectedId] = useState(objects[0]?.id);
  const [newModel, setNewModel] = useState<FrontEnsembleModel | ''>('');
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState('');
  const editing = !!draft;
  const selected = objects.find(object => object.id === selectedId) ?? objects[0];
  const selectedPose = selected && activeSet.staging?.[selected.id];
  const atLimit = objects.length >= STAGING_LIMITS.count;
  const formName = useRef<HTMLInputElement>(null);
  const chooser = useRef<HTMLSelectElement>(null);
  const add = useRef<HTMLButtonElement>(null);
  const geometry = useRef<SVGGElement>(null);
  const context = () => ({ setId: activeSet.id, revision: store.getState().project.revision, epoch: store.getState().ui.projectEpoch });
  const bounds = (key: Dimension) => key === 'x' ? [0, field.width] : key === 'y' ? [0, field.height] : [STAGING_LIMITS.minSize, STAGING_LIMITS.maxSize];

  useLayoutEffect(() => {
    if (editing) formName.current?.focus();
    else (chooser.current ?? add.current)?.focus();
  }, [editing]);

  function begin(object?: StagingObject) {
    const model = object ? object.model : newModel || undefined;
    const equipment = model ? frontEnsembleCatalog[model] : undefined;
    let name = equipment?.name ?? `Prop ${objects.length + 1}`;
    if (!object && equipment) {
      const taken = new Set(objects.map(item => item.name.toLowerCase()));
      for (let suffix = 2; taken.has(name.toLowerCase()); suffix++) name = `${equipment.name} ${suffix}`;
    }
    const source = object ? activeSet.staging![object.id] : {
      x: field.width / 2, y: field.height * .9, angle: 0, visible: true,
      width: equipment?.width ?? 3, depth: equipment?.depth ?? 1.5, height: equipment?.height ?? 1.5,
    };
    const values: Values = {
      x: surfaceNumber(yardsInUnit(source.x, unit)), y: surfaceNumber(yardsInUnit(source.y, unit)),
      width: surfaceNumber(yardsInUnit(source.width, unit)), depth: surfaceNumber(yardsInUnit(source.depth, unit)),
      height: surfaceNumber(yardsInUnit(source.height, unit)), angle: surfaceNumber(source.angle),
      start: surfaceNumber((source.travel?.start ?? 0) * counts), end: surfaceNumber((source.travel?.end ?? 1) * counts),
    };
    setError('');
    setDraft({ ...context(), create: !object, object: object ?? { id: uid(), name, ...(model ? { model } : {}) },
      source, values, initial: values, visible: source.visible });
  }

  function patch(key: NumericField, value: string) {
    setDraft(previous => previous && { ...previous, values: { ...previous.values, [key]: value } });
    setError('');
  }

  let proposed: StagingPose | undefined;
  let invalid = '';
  if (draft) {
    const read = (key: NumericField) => draft.values[key].trim() ? Number(draft.values[key]) : NaN;
    const edited = (key: NumericField, original: number, convert: (value: number) => number) =>
      draft.values[key] === draft.initial[key] ? original : convert(read(key));
    const yards = (key: Dimension) => edited(key, draft.source[key], value => {
      const [min, max] = bounds(key);
      if (value === Number(surfaceNumber(yardsInUnit(min, unit)))) return min;
      if (value === Number(surfaceNumber(yardsInUnit(max, unit)))) return max;
      const result = unitInYards(value, unit);
      if (!Number.isFinite(result) || result < min || result > max) {
        throw new Error(`${dimensions.find(([item]) => item === key)![1]} must be between ${surfaceNumber(yardsInUnit(min, unit))} and ${surfaceNumber(yardsInUnit(max, unit))} ${unit}.`);
      }
      return result;
    });
    try {
      const travel = counts ? { start: edited('start', draft.source.travel?.start ?? 0, value => value / counts),
        end: edited('end', draft.source.travel?.end ?? 1, value => value / counts) } : draft.source.travel;
      if (counts && (!Number.isFinite(travel!.start) || !Number.isFinite(travel!.end)
        || travel!.start < 0 || travel!.end > 1 || travel!.start >= travel!.end)) {
        throw new Error(`Enter a start before the end, within counts 0–${counts}.`);
      }
      const angle = edited('angle', draft.source.angle, value => value === 360 ? 0 : value);
      if (!Number.isFinite(angle) || angle < 0 || angle >= 360) throw new Error('Enter an orientation from 0° to 360°.');
      const pose: StagingPose = { x: yards('x'), y: yards('y'), width: yards('width'), depth: yards('depth'), height: yards('height'),
        angle, visible: draft.visible, ...(travel ? { travel } : {}) };
      proposed = validateStagingPoses({ [draft.object.id]: pose }, [draft.object], field, 'pose')![draft.object.id];
    } catch (cause) {
      invalid = (cause as Error).message.replace(/^Invalid project: pose\.[^.]+\./, 'Prop ');
    }
  }

  function place(event: MouseEvent<SVGSVGElement>) {
    const matrix = geometry.current?.getScreenCTM();
    if (!draft || !matrix) return;
    const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (x < 0 || y < 0 || x > field.width || y > field.height) return;
    setDraft({ ...draft, values: { ...draft.values, x: surfaceNumber(yardsInUnit(x, unit)), y: surfaceNumber(yardsInUnit(y, unit)) } });
    setError('');
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !proposed || !draft.object.name.trim()) return;
    const { object, create, setId, revision, epoch } = draft;
    if (dispatch('staging.save', { object, create, setId, revision, epoch, pose: proposed }) !== true) {
      setError(store.getState().ui.toast || 'This set changed. Cancel and reopen the prop before editing.');
      return;
    }
    setSelectedId(draft.object.id);
    setDraft(undefined);
    setError('');
  }

  async function remove(object: StagingObject) {
    const review = context();
    if (!await c.confirm({ title: `Remove “${object.name}”?`, message: 'Its placement will be removed from every set. You can undo this edit.',
      confirmLabel: 'Remove prop', tone: 'danger' })) return;
    if (dispatch('staging.remove', { id: object.id, ...review }) !== true) setError('This set changed. Reopen the props panel and try again.');
    else requestAnimationFrame(() => (chooser.current ?? add.current)?.focus());
  }

  const stored = sampleStaging(project, { setIndex: index, progress: 1 });
  const preview = draft && proposed ? [...stored.filter(item => item.id !== draft.object.id), { ...draft.object, ...proposed }] : stored;
  const numericField = (key: NumericField, label: string, min: number, max: number) => <label className="form-label" key={key}>{label}
    <input type="number" min={min} max={max} step="any" required value={draft!.values[key]} onChange={event => patch(key, event.target.value)} />
  </label>;
  return <Modal title="Staging props" onClose={() => c.setDialog(null)} wide className="staging-panel">
    <p className="modal-intro">Set {index + 1} · <strong>{activeSet.name}</strong></p>
    <div className="staging-layout">
      <figure className="staging-preview">
        <svg role="img" aria-label="Prop footprint preview" viewBox={`-5 -7 ${field.width + 10} ${field.height + 14}`}
          data-placing={editing || undefined} onClick={editing ? place : undefined}>
          <g ref={geometry} transform={fieldViewTransform(field, orientation)}>
            <FieldDrawing project={project} positions={activeSet.positions} showLabels={false} />
            <StagingFootprints objects={preview} selectedId={draft?.object.id ?? selected?.id} />
          </g>
        </svg>
        <figcaption className="microcopy">{editing ? `Click to place the center, or enter X and Y in ${unit}.` : 'The stripe marks the front. A dashed outline marks a hidden prop.'}</figcaption>
      </figure>
      {draft ? <form className="staging-form" aria-label="Prop settings" onSubmit={save} noValidate>
        <label className="form-label">Prop name<input ref={formName} required maxLength={STAGING_LIMITS.name} value={draft.object.name}
          onChange={event => { setDraft({ ...draft, object: { ...draft.object, name: event.target.value } }); setError(''); }} /></label>
        <div className="staging-inputs">{dimensions.map(([key, label]) => {
          const [min, max] = bounds(key);
          const planning = draft.object.model && key !== 'x' && key !== 'y' ? 'Planning ' : '';
          return numericField(key, `${planning}${planning ? label.toLowerCase() : label} · ${unit}`, yardsInUnit(min, unit), yardsInUnit(max, unit));
        })}
          {numericField('angle', 'Orientation · degrees', 0, 360)}
        </div>
        <p className="microcopy">X is measured from the left and Y from the back. At 0° the prop faces the audience.</p>
        {draft.object.model && <p className="microcopy">The {frontEnsembleCatalog[draft.object.model].name.toLowerCase()} model keeps its scale. Width and depth set the planning footprint.</p>}
        {counts > 0 && <fieldset className="staging-travel">
          <legend>Incoming move · {counts} counts</legend>
          <div className="staging-inputs">{numericField('start', 'Start count', 0, counts)}{numericField('end', 'End count', 0, counts)}</div>
        </fieldset>}
        <label className="staging-visible"><input type="checkbox" checked={draft.visible}
          onChange={event => setDraft({ ...draft, visible: event.target.checked })} />Visible at this set</label>
        <p className="microcopy">{draft.create ? 'New props start with the same placement and visibility in every set.' : 'Placement and visibility apply to this set. The prop name applies to the whole production.'}</p>
        {invalid && <p className="field-error" role="status">{invalid}</p>}
        <div className="modal-actions"><button type="button" className="button subtle" onClick={() => { setDraft(undefined); setError(''); }}>Cancel</button>
          <button type="submit" className="button primary" disabled={!proposed || !draft.object.name.trim()}>Apply prop</button></div>
      </form> : <div className="staging-chooser">
        {selected ? <>
          <label className="form-label">Prop<select ref={chooser} value={selected.id} onChange={event => { setSelectedId(event.target.value); setError(''); }}>
            {objects.map(object => <option key={object.id} value={object.id}>{object.name}</option>)}
          </select></label>
          <p className="microcopy">{selected.model && `${frontEnsembleCatalog[selected.model].name} · `}{selectedPose?.visible ? 'Visible' : 'Hidden'} at this set</p>
          <div className="staging-buttons"><button className="button primary" onClick={() => begin(selected)}>Edit prop</button>
            <button className="button subtle" onClick={() => void remove(selected)}>Remove prop…</button></div>
        </> : <p className="microcopy">No props in this production.</p>}
        <div className="staging-add">
          <label className="form-label">Prop type<select value={newModel} disabled={atLimit} onChange={event => {
            const value = event.target.value;
            setNewModel(isFrontEnsembleModel(value) ? value : '');
          }}>
            <option value="">Generic prop</option>
            <optgroup label="Front ensemble">{Object.entries(frontEnsembleCatalog).map(([id, { name }]) => <option key={id} value={id}>{name}</option>)}</optgroup>
          </select></label>
          <button ref={add} className={`button ${selected ? 'subtle' : 'primary'}`} disabled={atLimit} onClick={() => begin()}><Plus size={15} />Add prop</button>
          {atLimit && <p className="microcopy">This production has the maximum of {STAGING_LIMITS.count} props.</p>}
        </div>
      </div>}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </Modal>;
}
