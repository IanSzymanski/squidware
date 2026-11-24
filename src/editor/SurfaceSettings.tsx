import { useRef, useState } from 'react';
import { StaticFieldMarkings } from '../components/Field2D';
import { FormattedNumberInput } from '../components/NumberField';
import { validateProjectEdit } from '../domain';
import {
  FOOTBALL_SURFACE, isCustomSurface, SURFACE_AXES, SURFACE_LIMITS, SURFACE_NAMES, SURFACE_UNITS,
  surfaceNumber, surfaceViewBox, unitInYards, validateSurface, yardsInUnit,
  type CustomSurface, type Surface, type SurfaceBackground, type SurfaceUnit,
} from '../surfaces';
import type { EditorController } from './useEditorController';
import './surfaceSettings.css';

const indoor: CustomSurface = { preset: 'indoor', width: 28, height: 16 + 2 / 3, unit: 'ft', referenceInterval: 6 };
const backgroundFields = { x: 'Background X', y: 'Background Y', width: 'Background width', height: 'Background depth' } as const;
type BackgroundField = keyof typeof backgroundFields;

type Draft = {
  preset: Surface['preset'];
  unit: SurfaceUnit;
  width: number | string;
  height: number | string;
  referenceInterval: number | string;
  background?: Record<BackgroundField, number | string> & { image: string };
};

function toDraft(field: Surface): Draft {
  if (!isCustomSurface(field)) return { ...indoor, preset: field.preset };
  const { unit, background } = field;
  const convert = (value: number) => yardsInUnit(value, unit);
  return {
    ...field, width: convert(field.width), height: convert(field.height),
    background: background && { image: background.image, x: convert(background.x), y: convert(background.y), width: convert(background.width), height: convert(background.height) },
  };
}

function fromDraft(draft: Draft): Surface {
  const { preset, unit, background } = draft;
  if (preset === 'college' || preset === 'high-school') return { ...FOOTBALL_SURFACE, preset };
  const number = (value: string | number) => String(value).trim() ? Number(value) : NaN;
  const parse = (value: string | number) => unitInYards(number(value), unit);
  const dimension = (value: string | number, label: string) => {
    const physical = parse(value);
    if (!Number.isFinite(physical) || physical < SURFACE_LIMITS.minSize || physical > SURFACE_LIMITS.maxSize) {
      const min = surfaceNumber(yardsInUnit(SURFACE_LIMITS.minSize, unit));
      const max = surfaceNumber(yardsInUnit(SURFACE_LIMITS.maxSize, unit));
      throw new Error(`${label} must be between ${min} and ${max} ${unit}.`);
    }
    return physical;
  };
  return validateSurface({
    preset, unit, width: dimension(draft.width, 'Width'), height: dimension(draft.height, 'Depth'), referenceInterval: number(draft.referenceInterval),
    background: background && { image: background.image, x: parse(background.x), y: parse(background.y), width: parse(background.width), height: parse(background.height) },
  });
}

async function readBackground(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error('Choose a PNG or JPEG image up to 12 MiB.');
  }
  const image = await createImageBitmap(file).catch(() => { throw new Error('This image could not be read. Choose a valid PNG or JPEG.'); });
  try {
    const ratio = Math.min(1, SURFACE_LIMITS.imagePixels / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The image could not be prepared for this project.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    image.close();
  }
}

const samePosition = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function sameBackground(a?: SurfaceBackground, b?: SurfaceBackground): boolean {
  return a === b || !!a && !!b && a.image === b.image && samePosition(a.x, b.x) && samePosition(a.y, b.y) && samePosition(a.width, b.width) && samePosition(a.height, b.height);
}

export function SurfaceSettings({ controller: { project, dispatch } }: { controller: EditorController }) {
  const [draft, setDraft] = useState(() => toDraft(project.field));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const custom = draft.preset === 'indoor' || draft.preset === 'custom';
  const patch = (update: Partial<Draft>) => { setDraft(previous => ({ ...previous, ...update })); setError(''); };
  function choosePreset(preset: Surface['preset']) {
    if (!custom && (preset === 'indoor' || preset === 'custom')) {
      patch(toDraft(preset === 'indoor' ? indoor : { ...indoor, preset, width: 40, height: 25, unit: 'yd', referenceInterval: 5 }));
    } else patch({ preset });
  }
  function chooseUnit(unit: SurfaceUnit) {
    const convert = (value: number | string) => String(value).trim() && Number.isFinite(Number(value))
      ? yardsInUnit(unitInYards(Number(value), draft.unit), unit) : value;
    const { background } = draft;
    patch({
      unit, width: convert(draft.width), height: convert(draft.height),
      referenceInterval: convert(draft.referenceInterval),
      background: background && { image: background.image, x: convert(background.x), y: convert(background.y), width: convert(background.width), height: convert(background.height) },
    });
  }
  function fitBackground(image: string) {
    patch({ background: { image, x: 0, y: 0, width: draft.width, height: draft.height } });
  }
  async function importBackground(file: File) {
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const image = await readBackground(file);
      if (id !== request.current) return;
      setDraft(previous => ({ ...previous, background: { image, x: 0, y: 0, width: previous.width, height: previous.height } }));
    } catch (cause) {
      if (id === request.current) setError((cause as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  let preview: Surface | undefined;
  let invalid = '';
  try { preview = fromDraft(draft); }
  catch (cause) {
    const message = (cause as Error).message.replace(/^Invalid project: field\.?/, '');
    invalid = message.charAt(0).toUpperCase() + message.slice(1);
  }
  const previous = project.field;
  const changed = preview && (preview.preset !== previous.preset || !samePosition(preview.width, previous.width) || !samePosition(preview.height, previous.height)
    || isCustomSurface(preview) && isCustomSurface(previous)
      && (preview.unit !== previous.unit || preview.referenceInterval !== previous.referenceInterval || !sameBackground(preview.background, previous.background)));

  function apply() {
    if (!preview || !changed) return;
    try {
      if (!samePosition(preview.width, previous.width) || !samePosition(preview.height, previous.height)) validateProjectEdit(project, { ...project, field: preview });
    } catch (cause) {
      setError(`The surface was kept at its current size. Check existing performer positions, formations, paths and routes. ${(cause as Error).message}`);
      return;
    }
    if (dispatch('surface.update', { field: preview }) === true) setDraft(toDraft(preview));
  }
  const input = (label: string, value: number | string, onChange: (value: string) => void) => <label className="form-label">
    {label} · {draft.unit}<FormattedNumberInput value={value} step="any" format={surfaceNumber} onChange={onChange} />
  </label>;

  return <fieldset className="surface-settings">
    <legend>Performance surface</legend>
    <label className="form-label">Field markings<select value={draft.preset} onChange={event => choosePreset(event.target.value as Surface['preset'])}>
      {Object.entries(SURFACE_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {custom && <>
      <label className="form-label">Coordinate units<select value={draft.unit} onChange={event => chooseUnit(event.target.value as SurfaceUnit)}>
        {Object.entries(SURFACE_UNITS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <div className="form-row surface-axis-fields">
        {input('Width', draft.width, width => patch({ width }))}
        {input('Depth', draft.height, height => patch({ height }))}
        {input('Reference line spacing', draft.referenceInterval, referenceInterval => patch({ referenceInterval }))}
      </div>
      <p className="microcopy">{SURFACE_AXES}</p>
      <button className="button subtle" type="button" onClick={() => backgroundInput.current?.click()}>
        {draft.background ? 'Replace background image' : 'Add background image'}
      </button>
      <input ref={backgroundInput} type="file" aria-label="Background image" accept="image/png,image/jpeg" hidden onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importBackground(file);
      }} />
      {draft.background && <>
        <div className="form-row surface-axis-fields surface-background-fields">
          {(Object.keys(backgroundFields) as BackgroundField[]).map(key => <div key={key}>{input(backgroundFields[key], draft.background![key], value =>
            patch({ background: { ...draft.background!, [key]: value } }))}</div>)}
        </div>
        <div className="form-row">
          <button className="button subtle" type="button" onClick={() => fitBackground(draft.background!.image)}>Fit to surface</button>
          <button className="button subtle" type="button" onClick={() => { request.current += 1; setLoading(false); patch({ background: undefined }); }}>Remove background</button>
        </div>
      </>}
      {preview && <svg className="surface-settings-preview" viewBox={surfaceViewBox(preview, 2)} role="img" aria-label="Performance surface preview">
        <StaticFieldMarkings {...preview} showGrid={false} />
      </svg>}
    </>}
    <div className="form-row">
      <button type="button" className="button primary" disabled={!changed || loading} onClick={apply}>Apply surface</button>
      <button type="button" className="button subtle" disabled={!changed && !invalid && !error && !loading} onClick={() => {
        request.current += 1; setLoading(false); setDraft(toDraft(previous)); setError('');
      }}>Reset draft</button>
    </div>
    {(error || invalid || loading) && <p role="status" className={loading ? 'microcopy' : 'field-error'}>{error || invalid || 'Preparing background image…'}</p>}
  </fieldset>;
}
