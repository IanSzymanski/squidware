# Formation previews

Select performers or explicitly choose Select all, then choose Shape or a formation in the Inspector. Line, Arc, Circle, Block and Wave show proposed dots, original outlines and dashed assignment paths. No preview changes project coordinates, history, saved-file status, recovery or exports.

Edit width, depth/bulge, rotation, center coordinates and block columns in the Inspector. Each shape retains its own parameters for the current application session, seeded from the personal formation defaults on first use. Shape dimensions are in yards; presentation orientation does not change their field meaning. Assignment remains in roster order; positional-order assignment is tracked separately by [#26](https://github.com/IanSzymanski/squidware/issues/26).

- Line and arc endpoints change width, center and rotation while keeping the opposite endpoint fixed.
- The arc bulge handle changes depth while retaining its baseline endpoints.
- Circle, block and wave width/depth handles change their local dimensions.
- The center handle moves the shape; the offset round handle rotates it.
- Numeric controls provide a keyboard alternative for every handle. Enter in a numeric field accepts that parameter; Escape restores its previous value.

Apply formation or Enter while the field is focused commits the exact visible destinations as one named undo action. Cancel or Escape outside an input discards the preview. Escape during a handle drag restores the parameters from the start of that gesture and leaves the preview open. Invalid/incomplete input and unchanged previews cannot apply. Shapes crossing a field boundary show an error and cannot apply; they are never silently translated, shrunk or clipped.

Changing selection, set, view, workspace, playback, dialog, project revision or transaction invalidates the preview synchronously. Unrelated input drafts are preserved. Other position edits are locked while a formation preview is active. The project format remains v2 and stores only accepted coordinates.

## Validation and design guidance

This implements the shared guidance sections 1–5: the existing Inspector, selection bar, NumberField, HelpButton, command registry, field view matrix and history store own the interaction. Apply/Cancel stay above the scrolling parameter section. Selection and invalid states have geometric/text cues. Existing visual theme and section colors are retained; additional themes remain separately tracked.

Source tests cover all five shapes, boundary/invalid input, 500 exact block destinations, handle math, independent drafts, cancellation, context invalidation, save/reopen, one history action and undo/redo. The editor workflow owns native pointer/keyboard, preview-save immutability, endpoint/numeric agreement, arc bulge and layout checks at 1366/1120 × 768 with 100/125% UI scale. The field workflow owns flipped-coordinate interactions and presentation. Evidence is stored in `docs/evidence/formation-previews/`.

Windows results are recorded in the implementation PR and local review report. Cross-platform automation and actual writer/device acceptance remain separate checks; this change does not claim completion of those validation issues.
