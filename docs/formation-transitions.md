# Controlled formation transitions

Pause at an arrival set in 2D with full-show editing. Select 2–500 performers and open **Formation transition…** in Formation tools, or search **Formation transition** in Commands. The incoming move joins the previous set to this arrival set.

Choose an editable source formation on the previous set and an editable destination formation on the arrival set. Every selected performer must belong to both. Prepare these endpoints using **Keep editable on this set** in a shape preview. A saved parametric template now offers the same checkbox in its placement preview; applying it creates live geometry and membership as one undo action. Saved dot pictures remain anonymous snapshots. Existing conflicting live membership must be edited or explicitly detached before keeping a template editable.

The mapping table shows each performer's exact source and destination slot, saved pins, and path choice. Identity determines the mapping; this review never reassigns destinations. Both endpoint forms, coordinates, vacant slots, membership and assignment restrictions remain fixed. To change assignments, cancel and use [Optimize assignment](assignment-optimization.md) on the destination formation first.

## Group controls and individual paths

Choose straight or curved travel. **Bend** offsets both cubic controls perpendicular to the member's source-to-destination vector; a positive value bends left along that direction. Departure and arrival use local counts within this move. Holds before departure and after arrival are implicit. **Member stagger** delays each group-controlled member by its zero-based selected-member rank in source or destination slot order. Preserved and overridden members retain their place in that rank sequence, although their own timing is unchanged.

No control is clipped to the field or move duration. Out-of-field curve controls, reversed/overlapping intervals and arrivals past the move end block Apply with an explanation. Stationary members remain stationary rather than acquiring an artificial curved loop. Counts, tempo, easing and marching-direction declarations stay fixed.

Existing authored paths default to **Preserve saved travel**, including curves, holds and independently timed submoves. Other members default to group controls. In **Mapping and overrides**, choose a member and explicitly select:

- **Preserve saved travel** to keep its original path, or default travel if none was saved.
- **Use group controls** to replace that member's saved travel with the current group settings.
- **Individual override** to start from the currently previewed path and edit up to 32 travel/hold intervals, intermediate arrivals and cubic controls. An empty override uses default whole-move straight travel. The last travel interval must reach the unchanged destination.

Switching from an override back to group/preserve retains the local override rows for later comparison until the review closes. Those rows do not affect the chosen policy.

## Review and acceptance

**Movement preview** scrubs fractional counts through playback's evaluator. Section-colored dots show the full cast; selected original outlines, selected paths and the inspected member's count ticks aid comparison. Circles/squares mark fixed source/destination slots. Paths and original outlines can be hidden independently. These display choices never edit movement.

Current/proposed cards show selected total and longest travel, conservative peak-demand bounds in yd/count, and all-cast spacing/crossing and stride findings. Possible findings and unconverged bounds remain explicit. Distances use the shared adaptive path-length estimator; demand and findings use the shared detailed analysis engine. These counts are findings, not unique intersections or clearance guarantees. The first 100 proposed findings can seek the local preview; totals include all findings. After Apply, Problems provides the normal production analysis workflow.

Each candidate is checked by a background worker before Apply becomes available. Edits terminate outdated work; failure, a 20-second work budget or a separate 30-second watchdog offers Retry or Cancel without accepting partial results. Changes to the production, move, set, selection or editing mode require reopening the review. Cancel/Escape discards the draft and terminates unfinished work. Native file actions are suppressed during the modal, and pending edits cannot be saved through the file handler.

**Apply transition · one undo** changes only the chosen members' path definitions on this incoming move. Endpoint geometry, performers, other members' paths and other moves stay fixed. Undo/Redo restores the entire accepted transition atomically. An unchanged review creates no history entry.

The result materializes ordinary [movement paths](movement-paths.md) and [schedules](movement-schedules.md), using their existing v5/v6 formats; live endpoints require v7 and saved assignment constraints require v11. No new file version or hidden transition preset is introduced. Saving/reopening retains exact path definitions and identity mappings. Reopening the transition editor protects all saved authored paths again; it does not reconstruct the previous group-control settings. Explicitly choose group controls for members you want to replace.

See [review and validation evidence](evidence/formation-transitions/README.md) and the registered `formation-transitions` desktop suite.
