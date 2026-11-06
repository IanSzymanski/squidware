import { useState } from 'react';
import { Modal } from '../components/Modal';
import { DEFAULT_SNAPPING, snapDescription, type SnapSettings } from '../snapping';
import { HelpButton } from './ControlHelp';
import { SnapSettingsFields } from './SnapSettingsFields';
import type { EditorController } from './useEditorController';

export function SnappingPanel({ controller: c }: { controller: EditorController }) {
  const [settings, setSettings] = useState(() => ({ ...(c.project.snapping ?? DEFAULT_SNAPPING) }));
  const current = c.project.snapping ?? DEFAULT_SNAPPING, changed = (Object.keys(DEFAULT_SNAPPING) as (keyof SnapSettings)[]).some(k => settings[k] !== current[k]);
  return <Modal title="Grid and snapping" onClose={() => c.setDialog(null)}>
    <p className="modal-intro">Placement rules saved with this production. Changing them leaves performer positions unchanged.</p>
    <SnapSettingsFields value={settings} onChange={setSettings} />
    <p className="microcopy" role="status">{snapDescription(settings, c.snap)}. The magnet toggles snapping; exact transforms and formation previews keep their own geometry.</p>
    <div className="modal-actions">
      <button className="button subtle" onClick={() => c.setDialog(null)}>Cancel</button>
      <HelpButton title="Apply rules" description="Save these placement rules with the production as one undo action. Performer positions stay unchanged." disabled={!changed} disabledReason="Change a rule first. These are the production's current rules." className="button primary" onClick={() => { if (c.dispatch('snapping.update', { settings })) c.setDialog(null); }}>Apply rules</HelpButton>
    </div>
  </Modal>;
}
