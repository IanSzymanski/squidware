import { useState } from 'react';
import { Modal } from '../components/Modal';
import { DEFAULT_SNAPPING, snapDescription } from '../snapping';
import { SnapSettingsFields } from './SnapSettingsFields';
import type { EditorController } from './useEditorController';

export function SnappingPanel({ controller: c }: { controller: EditorController }) {
  const [settings, setSettings] = useState(() => ({ ...(c.project.snapping ?? DEFAULT_SNAPPING) }));
  return <Modal title="Grid and snapping" onClose={() => c.setDialog(null)}>
    <p className="modal-intro">Placement rules saved with this production. Changing them leaves performer positions unchanged.</p>
    <SnapSettingsFields value={settings} onChange={setSettings} />
    <p className="microcopy" role="status">{snapDescription(settings, c.snap)}. The magnet toggles snapping; exact transforms and formation previews keep their own geometry.</p>
    <div className="modal-actions">
      <button className="button subtle" onClick={() => c.setDialog(null)}>Cancel</button>
      <button className="button primary" onClick={() => { if (c.dispatch('snapping.update', { settings })) c.setDialog(null); }}>Apply rules</button>
    </div>
  </Modal>;
}
