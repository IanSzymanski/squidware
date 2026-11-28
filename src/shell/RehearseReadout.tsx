import { useEditorSelector } from '../editor/react';
import { lastWholeCount, timelineReadout } from '../editor/timelineNavigation';
import type { EditorController } from '../editor/useEditorController';

/**
 * The count, large enough to read from across a rehearsal room: which set the ensemble is moving to and where in the
 * move it is. The transport below also shows fractional counts when paused.
 */
export function RehearseReadout({ controller }: { controller: EditorController }) {
  const count = useEditorSelector(state => state.playback.count);
  const position = timelineReadout(controller.project, count);
  const local = lastWholeCount(position.localCount);
  return <div className="rehearse-readout" role="status" aria-label={position.opening ? `Opening set: ${position.name}` : `${position.arrived ? 'At' : 'Moving to'} set ${position.setIndex + 1}, count ${local} of ${position.counts}`} aria-live="off">
    <span className="rehearse-readout-set">{position.opening || position.arrived ? 'Set' : 'To set'} <strong>{position.setIndex + 1}</strong></span>
    {position.opening
      ? <span className="rehearse-readout-count rehearse-readout-count--word">Opening</span>
      : <span className="rehearse-readout-count">{local}<small>/ {position.counts}</small></span>}
  </div>;
}
