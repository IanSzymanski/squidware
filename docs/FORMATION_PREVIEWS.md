# Formation previews

Select performers or explicitly choose Select all, then choose Shape or a formation in the Inspector. Line, Arc, Circle, Block and Wave show proposed dots, original outlines and dashed assignment paths. No preview changes project coordinates, history, saved-file status, recovery or exports.

Edit width, depth/bulge, rotation, center coordinates and block columns in the Inspector. Each shape retains its own parameters for the current application session, seeded from the personal formation defaults on first use. Shape dimensions are in yards; presentation orientation does not change their field meaning. New previews default to **Positional order**. Choose **Roster order** explicitly to assign destinations in Cast order. Each shape retains its assignment choice for the session. The Inspector shows total and longest straight-line travel in yards; dashed paths show each identity’s original and proposed positions.

- Line and arc endpoints change width, center and rotation while keeping the opposite endpoint fixed.
- The arc bulge handle changes depth while retaining its baseline endpoints.
- Circle, block and wave width/depth handles change their local dimensions.
- The center handle moves the shape; the offset round handle rotates it.
- Numeric controls provide a keyboard alternative for every handle. Enter in a numeric field accepts that parameter; Escape restores its previous value.

Apply formation or Enter while the field is focused commits the exact visible destinations as one named undo action. Cancel or Escape outside an input discards the preview. Escape during a handle drag restores the parameters from the start of that gesture and leaves the preview open. Invalid/incomplete input and unchanged previews cannot apply. Shapes crossing a field boundary show an error and cannot apply; they are never silently translated, shrunk or clipped.

Changing selection, set, view, workspace, playback, dialog, project revision or transaction invalidates the preview synchronously. Unrelated input drafts are preserved. Other position edits are locked while a formation preview is active. The project format remains v2 and stores only accepted coordinates.

## Positional assignment

Line, arc and wave order performers along the preview’s initial local X axis, with local Y and stable performer ID as tie breakers. Block orders by local Y, groups by the chosen column count, then orders each row by local X. Circle follows clockwise angular order from local top around the original selection center, using radius and stable ID for ties. Keys are quantized to 10⁻⁸ yards/radians to absorb inverse-rotation roundoff; saved destinations keep their existing precision. Center summation uses stable ID order, so roster shuffling cannot introduce a different center.

The ID-to-slot plan is captured when a preview begins. Center, dimensions and rotation move those same assignments without jumping performers between destinations during a gesture. Changing the assignment mode or shape recomputes the plan; changing block columns recomputes its ranks in the captured axes. Existing positional previews can be compared with roster mode before acceptance. These deterministic rules preserve order; they do not minimize every route or guarantee collision-free travel. Pinned/role constraints and optimization remain [#78](https://github.com/IanSzymanski/squidware/issues/78).

The assignment planner is separate from destination generation. The preview accepts a validated permutation of selected IDs, allowing future planners to use the same preview/accept/undo boundary. Pure callers omitting the new assignment option retain roster order. Assignment mode and the captured plan are session data, while accepted files store only coordinates in format v2.

## Validation and design guidance

This implements the shared guidance sections 1–5: the existing Inspector, selection bar, NumberField, HelpButton, command registry, field view matrix and history store own the interaction. Apply/Cancel stay above the scrolling parameter section. Selection and invalid states have geometric/text cues. Existing visual theme and section colors are retained; additional themes remain separately tracked.

Source tests cover all five shapes, boundary/invalid input, 500 exact block destinations, handle math, independent drafts, cancellation, context invalidation, save/reopen, one history action and undo/redo. The editor workflow owns native pointer/keyboard, preview-save immutability, endpoint/numeric agreement, arc bulge and layout checks at 1366/1120 × 768 with 100/125% UI scale. The field workflow owns flipped-coordinate interactions and presentation. The dedicated `formation-assignment` workflow owns native mode choice, visible paths/travel, stable rotation identity, cancel, accepted identity mapping, named undo and native save/reopen. Source assignment tests cover shuffled/scattered/reversed/rotated/tied inputs, partial block ranks, circle seams, invalid permutations and 500 IDs. Evidence is stored in `docs/evidence/formation-previews/` and [assignment review evidence](evidence/formation-assignment/README.md).

Windows results are recorded in the implementation PR and local review report. Cross-platform automation and actual writer/device acceptance remain separate checks; this change does not claim completion of those validation issues.
