import { equipmentKey, guardCatalog, instrumentCatalog } from '../equipment';

export function EquipmentSelect({ label, value, inherited, onChange }: {
  label: string;
  value?: string;
  inherited?: boolean;
  onChange: (value: string | null) => void;
}) {
  return <select aria-label={label} value={equipmentKey(value) ?? value ?? ''} onChange={event => onChange(event.target.value || null)}>
    <option value="">{inherited ? 'Use section default' : 'No default equipment'}</option>
    {inherited && <option value="none">No equipment model</option>}
    {value && !equipmentKey(value) && (inherited ? value !== 'none' : true) && <option value={value}>Generic ({value})</option>}
    <optgroup label="Marching instruments">
      {Object.entries(instrumentCatalog).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
    </optgroup>
    <optgroup label="Color guard">
      {Object.entries(guardCatalog).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
    </optgroup>
  </select>;
}
