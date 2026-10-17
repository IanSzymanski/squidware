import type { SnapSettings } from '../snapping';

export function SnapSettingsFields({ value, onChange }: { value: SnapSettings; onChange: (value: SnapSettings) => void }) {
  return <>
    <div className="form-row">
      <label className="form-label">Step grid<select value={value.steps} onChange={e => onChange({ ...value, steps: Number(e.target.value) as SnapSettings['steps'] })}>
        <option value="8">8-to-5</option><option value="6">6-to-5</option><option value="12">12-to-5</option>
      </select></label>
      <label className="form-label">Grid subdivision<select value={value.subdivision} onChange={e => onChange({ ...value, subdivision: Number(e.target.value) as SnapSettings['subdivision'] })}>
        <option value="1">Whole steps</option><option value="2">Half steps</option><option value="4">Quarter steps</option>
      </select></label>
    </div>
    <label className="form-label">Snap targets<select value={value.target} onChange={e => onChange({ ...value, target: e.target.value as SnapSettings['target'] })}>
      <option value="grid">Step grid</option><option value="markings">5-yard lines, hashes and sidelines</option>
    </select></label>
    <label className="form-label">Group snapping<select value={value.group} onChange={e => onChange({ ...value, group: e.target.value as SnapSettings['group'] })}>
      <option value="anchor">Keep spacing · snap anchor</option><option value="individual">Snap each dot · spacing changes</option>
    </select></label>
    <p className="microcopy">{value.group === 'anchor' ? 'Dragging snaps the grabbed dot and keeps every group offset. Nudges anchor to the leftmost selected dot; ties use the backmost dot.' : 'Each selected dot snaps independently. This changes spacing and can bring dots together; inspect the drag preview before releasing.'} Nudges change only their movement axis. Field boundaries take priority when no target fits the group.</p>
  </>;
}
