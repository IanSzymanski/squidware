# Performer travel paths

Issue [#73](https://github.com/IanSzymanski/squidware/issues/73) adds one full-move cubic Bézier path per performer, alongside implicit/explicit straight lines. Independent holds and submoves are now described in [movement schedules](movement-schedules.md). Field handle manipulation remains #75. [Detailed spacing/stride checks](detailed-path-analysis.md) now run in the background with conservative bounds.

Pause at an arrival after the opening and select one performer. Choose **Edit performer path** in the Inspector or palette. Choose Cubic Bézier and enter two control points in field yards. Numeric typing, steppers and keyboard navigation are supported. Start/end coordinates follow the two sets. Solid preview, dashed saved geometry, numbered controls and a ring at the sampled count distinguish states without color alone. The local-count slider previews the same evaluator used by playback and 3D. Apply creates one named undo transaction; Cancel, Escape and backdrop dismissal preserve the production.

Control points must be finite and inside the field. Invalid/incomplete input hides the proposed field preview and blocks Apply. Revision, project session, active move and explicit selection must still match at Apply. Unrelated performers and endpoint pictures stay intact. Reopening the dialog retains segment identity and controls; choosing Straight line removes the override. Existing files retain their straight motion.

Bézier parameter progresses linearly with counts or through the move's ease-in/out timing. This does not imply constant travel speed. Curves can loop back to the same endpoint; a loop is not a hold. Fully coincident points are stationary. Adjacent moves share picture endpoints, with no automatic tangent smoothing. Curved coordinate output reports curved distance and average step size; its single peak-step field stays blank. Problems reports a bounded peak-stride interval. Exact vector geometry is used for incoming/outgoing overlays. Arrival-only SVG/PDF charts stay arrival charts.

[Spacing/stride analysis](detailed-path-analysis.md) uses conservative time-curve bounds in both the worker and reference API. Problems distinguishes confirmed witnesses, possible violations and unresolved bounds. Whole-move count edits retain control points and rescale the full segment duration. [Move operations](path-operations.md) supports reviewed count resizing, selected-path reversal and interval copy/paste. Splitting a curved move or changing a surviving curved move's predecessor remains rejected atomically; remove the curves first. Ordinary endpoint moves keep absolute controls, while performer removal prunes its path.

Saving any curve writes wire format v5; tempo maps and recording alignment remain independently optional and preserved. Removing all curves restores the least format version required by remaining timing metadata. The canonical editor remains schemaVersion 2 internally. See [format, precision and compatibility](../format/FORMAT.md#v5-curved-movement-extension) and [example](../format/examples/curved-v5.squid).

Design guidance sections 1–5 apply. Existing Modal, FieldDrawing, tooltips, theme tokens, command registry and transaction/history behavior are reused. The dialog adds no permanent field row. Evidence and measured viewport limits are recorded in [validation evidence](evidence/paths/README.md).


## Independent timing and intermediate arrivals

Choose **Edit movement timing** to add holds and independently timed straight/curved submoves. Existing timed paths automatically open that editor from Edit performer path, preventing the simple curve editor from replacing a schedule. The shared evaluator now also resolves intermediate destinations and movement holds; format v6 protects them on save. See [schedule behavior](movement-schedules.md).
