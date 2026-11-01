# Detailed movement operations

Issue [#77](https://github.com/IanSzymanski/squidware/issues/77) defines reviewed count resizing, selected-path reversal and interval copy/paste for [curves](movement-paths.md) and [independent schedules](movement-schedules.md). Pause on a picture and choose **Move operations…** in the Inspector or Command palette. The opening targets the first outgoing move; every later picture targets its incoming move, including the closing picture. A one-picture production has no move to operate on.

The dialog compares saved dashed geometry/ghost dots with proposed solid geometry and sampled performer rings. Its progress slider compares the same fraction of the old and new move durations, displaying both local counts. Apply validates the complete production and creates one named undo transaction. Cancel/Escape preserves the production. Shared focus help consumes Escape first while open. The reviewed move, picture, selection, revision, production session and paste clipboard identity must still match when applying; stale context requires reopening the dialog.

## Resize counts

Resize affects **every performer in the move**, even with no selection. Counts must be an integer from 1 to 1024. Every authored interval boundary is uniformly multiplied by `newCounts / oldCounts`; exact zero/end boundaries remain exact. Geometry, interval IDs, intermediate arrivals, explicit/implicit holds, move identity and endpoint pictures remain fixed. Nothing trims or drops to fit. The ordinary incoming-count fields follow the same policy. Opening-picture inline counts remain zero; use Move operations to resize its outgoing move.

Timing remains relative to the move. Tempo maps, score/recording anchors and other musical metadata retain their absolute written show counts. A change that strands an anchor, collapses an interval through numeric underflow or otherwise fails validation rejects the entire edit. Preview uses the same local-count evaluator as playback/3D. Resizing can change the production's duration and the timing of later pictures.

## Reverse selected paths

Explicitly select one or more performers before opening the dialog. Reverse swaps those performers' dots in **both endpoint pictures**, reverses interval order, maps each window `[start, end]` to `[counts − end, counts − start]`, swaps cubic controls and exchanges leading/trailing holds. Intermediate arrivals follow the reversed chain. Existing interval IDs remain attached to their intervals. An implicit straight path stays implicit.

Set order, move counts, tempo/easing and declared travel techniques stay fixed. Other performers stay fixed. Adjacent moves inherit the changed picture dots and must be reviewed; if an adjacent hold-only schedule becomes incompatible, the complete reversal is rejected. Facing is not inferred. Applying reverse twice restores timing/geometry within floating-point tolerance (the regression checks 1e-8 yard agreement), with exact IDs and endpoint dots.

## Copy intervals

Select exactly one source performer, choose Copy, and select one contiguous interval range. Intervening gaps/holds belong to that range; disjoint or empty selections are rejected. **Include whole move and outer holds** selects every interval and includes any implicit leading/trailing holds. Otherwise the copied window begins at the first selected interval and ends at the last selected interval.

Copy takes a deep snapshot with source performer/move identity, source timing profile, interval geometry and count window. Later source edits do not alter it. Copy changes neither production revision nor undo history. This clipboard lives only inside the current production session, uses no system clipboard or network, is absent from saved files, and clears when a production is loaded.

## Paste intervals

Select exactly one destination performer, open Move operations, and choose Paste. Review the explicit source-to-destination mapping, local paste start/duration, replacement count, geometric scale/rotation and timing profile. Counts uniformly rescale to the destination window, retaining gaps and holds. Different source/destination easing requires explicit acceptance of **destination timing**.

Coordinate choices are:

| Frame | Geometry policy |
| --- | --- |
| Keep field coordinates | Preserve absolute source coordinates; both endpoints must already match the destination window. |
| Translate from start | Translate the source start to the destination start; the translated end must match too. |
| Fit both endpoints | Translate, rotate and uniformly scale the fragment to both destination endpoints. No reflection or independent axis scaling. |

Destination window endpoints come from the saved path's shared sampler. Endpoint agreement uses 1e-8 yards, snapping accepted endpoints to the exact destination points. A closed/stationary fragment can fit only coincident target endpoints; a nonclosed fragment cannot collapse to a point. Transformed points/controls must remain inside the field. Nothing clips or extrapolates to fit.

The window may replace complete destination travel intervals. Cutting through a travel is rejected; choose interval boundaries, a hold/gap or the whole move. A boundary hold can split, with its original ID retained on the prefix or sole suffix and a fresh ID on a second suffix. Outside intervals retain geometry/IDs. Pasted intervals receive fresh IDs that remain stable between preview and Apply. Source data, destination endpoint pictures, other performers and destination easing remain fixed. Replacement loss is explicit before Apply.

The canonical validator enforces positive finite ordered/nonoverlapping windows, valid endpoint chains, scoped unique IDs, at most 32 intervals per performer path and the 10 MiB file budget. Any failure leaves production/history unchanged. Undo, save/reopen, overlays and coordinate exports retain the accepted geometry; [detailed spacing/stride checks](detailed-path-analysis.md) now recompute conservative bounds after geometry or timing edits.

## Compatibility and boundaries

No new wire version is required: detailed results use v6, full-move curves use v5 and ordinary implicit travel uses the least version required by remaining metadata. Legacy migration behavior remains unchanged; the clipboard is never serialized. Detailed transition splitting and timeline operations that change a surviving detailed move's predecessor remain guarded. These operations do not flatten a custom path to bypass those guards. Field handles remain #75.

Design guidance sections 1–5 apply. Shared Modal, FieldDrawing, theme tokens, focus help, command registry and history are reused. See [software review evidence](evidence/path-operations/README.md).
