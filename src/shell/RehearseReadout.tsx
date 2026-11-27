import { useEditorSelector } from '../editor/react';
import { formatTimelineCount, timelineReadout, transportCount } from '../editor/timelineNavigation';
import type { EditorController } from '../editor/useEditorController';

/**
 * The count, large enough to read from across a rehearsal room: which set the ensemble is moving to and where in the
 * move it is. Rehearse mode only; the transport below carries the same numbers small.
 */
export function RehearseReadout({ controller }: { controller: EditorController }) {
  const count = useEditorSelector(state => state.playback.count);
  const position = timelineReadout(controller.project, count);
  const local = formatTimelineCount(transportCount(position.localCount, controller.playing));
  return <div className="rehearse-readout" role="status" aria-label={position.opening ? `Opening set: ${position.name}` : `${position.arrived ? 'At' : 'Moving to'} set ${position.setIndex + 1}, count ${local} of ${position.counts}`} aria-live="off">
    <span className="rehearse-readout-set">{position.opening || position.arrived ? 'Set' : 'To set'} <strong>{position.setIndex + 1}</strong></span>
    {position.opening
      ? <span className="rehearse-readout-count rehearse-readout-count--word">Opening</span>
      : <span className="rehearse-readout-count">{local}<small>/ {position.counts}</small></span>}
  </div>;
}
