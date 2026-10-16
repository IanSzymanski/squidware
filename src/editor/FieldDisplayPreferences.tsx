import { NumberField } from '../components/NumberField';
import { Tooltip } from '../components/Tooltip';
import type { EditorController } from './useEditorController';

export function FieldDisplayPreferences({ preferences }: Pick<EditorController, 'preferences'>) {
  const { value: p, update } = preferences;
  return <section className="field-display-preferences" aria-label="2D field display preferences">
    <h3 className="modal-subtitle">2D field display</h3>
    <p className="microcopy">These choices affect the 2D view. Prints, exports and the 3D view keep their standard appearance.</p>
    <label className="form-label">Audience orientation<Tooltip name="Audience orientation" description="Turn the field view 180 degrees. Dragging and arrow keys follow the screen; drill coordinates and Inspector directions keep their field meaning."><select aria-label="Audience orientation" value={p.fieldOrientation} onChange={e => update({ fieldOrientation: e.target.value as typeof p.fieldOrientation })}>
      <option value="audience-bottom">Audience at bottom</option><option value="audience-top">Audience at top · flipped</option>
    </select></Tooltip></label>
    <div className="form-row">
      <NumberField label="Dot radius · pixels" description="Radius in CSS pixels, independent of field zoom and display density. Selection rings and pointer targets remain visible." value={p.fieldDotRadiusPx} min={2} max={8} step={.5} onChange={fieldDotRadiusPx => update({ fieldDotRadiusPx })} />
      <NumberField label="Label size · pixels" description="Text size in CSS pixels. Crowded labels are suppressed; focus a dot for its full coordinate readout." value={p.fieldLabelSizePx} min={11} max={24} onChange={fieldLabelSizePx => update({ fieldLabelSizePx })} />
    </div>
    <label className="form-label">Label visibility<Tooltip name="Label visibility" description="Always try all labels, show only selected or focused labels, or hide labels. The toolbar cycles the same saved setting."><select aria-label="Label visibility" value={!p.showLabels ? 'none' : p.selectionLabelsOnly ? 'selected' : 'all'} onChange={e => update({ showLabels: e.target.value !== 'none', selectionLabelsOnly: e.target.value === 'selected' })}>
      <option value="all">All · avoid overlaps</option><option value="selected">Selected or focused only</option><option value="none">Hidden</option>
    </select></Tooltip></label>
    <label className="form-label">Performer coloring<Tooltip name="Performer coloring" description="Use production section colors, distinguish the current selection from the remaining performers, or use one custom display color. White selection rings and square keyboard focus remain distinct."><select aria-label="Performer coloring" value={p.fieldColorMode} onChange={e => update({ fieldColorMode: e.target.value as typeof p.fieldColorMode })}>
      <option value="section">Section colors</option><option value="selection">Selection groups</option><option value="custom">Custom color</option>
    </select></Tooltip></label>
    {p.fieldColorMode === 'custom' && <label className="form-label">Custom performer color<Tooltip name="Custom performer color" description="Choose a screen-only dot color. Production section colors stay unchanged."><span className="display-color-control"><input type="color" aria-label="Custom performer color" value={p.fieldCustomColor} onChange={e => update({ fieldCustomColor: e.target.value })} /><span>{p.fieldCustomColor.toUpperCase()}</span></span></Tooltip></label>}
  </section>;
}
