import { Tooltip } from '../components/Tooltip';
import type { PasteFrame } from '../movementPathOperations';
import { HelpButton } from './ControlHelp';
import { formatTimelineCount } from './timelineNavigation';
import { useDockedEditorFocus } from './useDockedEditorFocus';
import type { PathOperationsSession } from './usePathOperations';
import './paths.css';

function CountInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="form-label">{label}
    <Tooltip pointerPassThrough name={label} description="Local written counts. Changes update the preview without editing the production.">
      <input type="number" aria-label={label} value={value} min={0} max={1024} step="any" onChange={event => onChange(event.target.value)} />
    </Tooltip>
  </label>;
}

export function PathOperationsPanel({ editor }: { editor: PathOperationsSession }) {
  const { initial, opening, values, progress, setProgress, update, summary, error, stale, changed, submitError, preview, apply, close } = editor;
  const { project, index, ids, clipboard, intervals } = initial;
  const { kind, counts, at, duration, frame, accept, selected, whole } = values;
  const move = project.moves[index];
  const names = ids.slice(0, 8).map(id => project.performers.find(person => person.id === id)?.label ?? id);
  const selection = ids.length > names.length ? `${names.join(', ')} and ${ids.length - names.length} more` : names.join(', ');
  const region = useDockedEditorFocus('Cancel move operation');
  const previewCounts = preview && (kind === 'copy' ? `Source count ${formatTimelineCount(preview.savedCount)}`
    : `Saved count ${formatTimelineCount(preview.savedCount)}, proposed count ${formatTimelineCount(preview.proposedCount)}`);
  const staleMessage = 'The production, selection or clipboard changed. Cancel and reopen.';

  return <section ref={region} aria-label="Move operations" className="path-panel path-operations-panel docked-path-editor">
    <div className="docked-path-heading"><h2>Move operations</h2></div>
    <div className="docked-path-actions">
      <HelpButton pointerPassThrough title="Cancel move operation" className="button subtle" onClick={close}>Cancel</HelpButton>
      <HelpButton pointerPassThrough title={kind === 'copy' ? 'Copy movement interval range' : 'Apply move operation'}
        description="Recheck the reviewed context before copying or applying the complete operation."
        disabled={!!error || stale || !changed}
        disabledReason={error || (stale ? staleMessage : kind === 'resize' ? `Enter counts other than ${move.counts} to resize this move.` : 'This operation would not change the move.')}
        className="button primary" onClick={apply}>{kind === 'copy' ? 'Copy interval range' : 'Apply · one undo'}</HelpButton>
    </div>
    <div className="path-fields">
      <p className="modal-intro">{project.sets[index].name} → {project.sets[index + 1].name} · {move.counts} counts. {opening ? 'Outgoing move from the opening set.' : 'Incoming move to the current set.'}</p>
      <label className="form-label">Operation
        <Tooltip pointerPassThrough name="Move operation" description="Choose whole-move count resizing, selected-path reversal, or a reviewed interval copy/paste.">
          <select aria-label="Move operation" value={kind} onChange={event => update({ kind: event.target.value as typeof kind })}>
            <option value="resize">Resize move counts</option>
            <option value="reverse">Reverse selected paths</option>
            <option value="copy">Copy selected intervals</option>
            <option value="paste">Paste copied intervals</option>
          </select>
        </Tooltip>
      </label>
      {kind === 'resize' && <>
        <CountInput label="New move counts" value={counts} onChange={counts => update({ counts })} />
        <p className="microcopy">Rescale interval counts for every performer. Keep geometry, holds and IDs. Musical anchors stay at their absolute show counts.</p>
      </>}
      {kind === 'reverse' && <p className="microcopy">{selection ? `Reverse paths for ${selection}.` : 'Select performers before reversing.'} Their endpoint dots swap, including in adjacent moves. Leading and trailing holds trade places.</p>}
      {kind === 'copy' && <>
        <p className="microcopy">{names.length === 1 ? `Source: ${names[0]}.` : 'Select exactly one source performer.'} Select one contiguous range, including any intervening holds.</p>
        <label className="form-label"><span>
          <Tooltip pointerPassThrough name="Include whole move and outer holds" description="Select every interval and retain implicit holds before departure and after arrival.">
            <input type="checkbox" aria-label="Include whole move and outer holds" checked={whole} onChange={event => update({
              whole: event.target.checked,
              selected: event.target.checked ? intervals.map(({ segment }) => segment.id) : selected,
            })}/>
          </Tooltip> Include whole move and outer holds
        </span></label>
        <ol className="path-copy-list">
          {intervals.map(({ segment }, i) => <li key={segment.id}><label>
            <Tooltip pointerPassThrough name="Copy interval" description="Choose one contiguous interval range, including intervening holds.">
              <input type="checkbox" aria-label={`Copy interval ${i + 1}`} checked={selected.includes(segment.id)} onChange={event => update({
                whole: false,
                selected: event.target.checked ? [...selected, segment.id] : selected.filter(id => id !== segment.id),
              })}/>
            </Tooltip> {segment.kind === 'hold' ? 'Hold' : segment.kind === 'cubic' ? 'Curve' : 'Travel'} · {segment.startCount}–{segment.endCount}
          </label></li>)}
        </ol>
      </>}
      {kind === 'paste' && <>
        <p className="microcopy">{clipboard
          ? `${clipboard.sourceLabel} / ${clipboard.sourceSetName} / counts ${clipboard.startCount}–${clipboard.endCount} → ${names.length === 1 ? names[0] : 'select exactly one destination performer'} / ${project.sets[index + 1].name}`
          : 'Copy intervals in this production before pasting.'}</p>
        <div className="form-row">
          <CountInput label="Paste start count" value={at} onChange={at => update({ at })} />
          <CountInput label="Paste duration" value={duration} onChange={duration => update({ duration })} />
        </div>
        <label className="form-label">Coordinate frame
          <Tooltip pointerPassThrough name="Paste coordinate frame" description="Keep field coordinates, translate the start, or rotate and uniformly scale to both destination endpoints.">
            <select aria-label="Paste coordinate frame" value={frame} onChange={event => update({ frame: event.target.value as PasteFrame })}>
              <option value="field">Keep field coordinates</option>
              <option value="translate">Translate from start</option>
              <option value="fit">Fit both endpoints</option>
            </select>
          </Tooltip>
        </label>
        {clipboard && clipboard.transition !== move.transition && <label className="form-label"><span>
          <Tooltip pointerPassThrough name="Accept destination timing" description="Keep the destination move’s timing profile when it differs from the copied source.">
            <input type="checkbox" aria-label="Accept destination timing" checked={accept} onChange={event => update({ accept: event.target.checked })}/>
          </Tooltip> Use destination {move.transition === 'ease' ? 'eased' : 'linear'} timing
        </span></label>}
        <p className="microcopy">Replace intervals inside this window. Boundaries may split holds. Choose complete travel intervals and matching endpoints.</p>
      </>}
      {(error || stale || submitError) && <p className="field-error" role="alert">{stale ? staleMessage : error || submitError}</p>}
      {preview && <>
        <p className="microcopy" role="status" aria-label="Move operation summary">{summary}</p>
        <label className="form-label">Preview progress · {progress}%
          <Tooltip pointerPassThrough name="Move operation preview progress" description="Compare the same fraction of the saved and proposed count ranges without editing the production.">
            <input type="range" aria-label="Move operation preview progress" aria-valuetext={`${progress}% · ${previewCounts}`} value={progress} min={0} max={100} step={1} onChange={event => setProgress(Number(event.target.value))} />
          </Tooltip>
        </label>
        <p className="microcopy">{previewCounts}. {kind === 'copy' ? 'The solid path shows the copy range.' : 'Dashed paths and rings show saved motion. Solid paths and rings show proposed motion.'}</p>
      </>}
    </div>
  </section>;
}
