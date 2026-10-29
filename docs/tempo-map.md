# Tempo ranges, ramps and fermatas — #52

Open **Sheet → Tempo map**, **Timeline view → Tempo map**, or search **Tempo map** in the Command palette. Move BPM cells remain base tempos. The shared map drives silent/media-clock rehearsal, audio-thread metronome scheduling, show durations, CSV timing and the PDF timing appendix. Meter, score positions, movement paths and physical geometry are unchanged.

## Edit and preview

Tempo ranges accept numeric CSV/TSV without headings: **From count, To count, Start BPM, End BPM**. Equal endpoint tempos make a fixed-tempo range; different values make a linear BPM ramp over counts. For example:

```csv
0,8,120,240
8,16,240,120
```

These ranges accelerate from 120 to 240 BPM over eight counts, then slow to 120 over the following eight. Ranges may cross move boundaries. A range overrides base move tempos only within its interval; gaps use each move's base tempo. Adjacent ranges may jump instantly to a new BPM. They cannot overlap.

Fermatas accept **Count, Seconds**, also without headings:

```csv
4,0.9
8,0.6
```

The preview shows original/proposed show duration, a BPM/count plot, hold markers and compiled intervals with exact start times/durations. A keyboard-focusable, scrollable table exposes every interval. **Apply tempo map** commits one named undo action; Cancel keeps the original project. Invalid or stale drafts cannot apply. Unrelated pending drafts remain protected. Clear both inputs and Apply to remove the map.

## Fermata and transport semantics

A fermata starts on arrival at its count, immediately after that count's metronome click. Show time and the recording continue while count and all performer positions freeze. The metronome emits no extra beats during the hold; the next count clicks after the hold plus its normal beat interval. The held count is not clicked again on release.

Seeking to a held count chooses the beginning of its pause. Every second inside that hold maps back to the same count; this is a deliberately non-invertible interval. Pause/resume retains partial hold progress, and changing rehearsal speed scales its remaining duration with the rest of the show. Explicit count stepping skips to the chosen count's arrival. A timing edit, project replacement or undo/redo reconstructs transport at the chosen count's arrival rather than retaining seconds from an obsolete map.

Rehearsal ranges use arrival times: starting at a held count includes that hold; ending at that count ends before it. Loops repeat included holds. A hold at show count zero is allowed when a move exists; the final count cannot have a hold. Use an earlier count for a pause before the final arrival. Count-in uses the instantaneous tempo at the chosen count, without adding a show's fermata to the lead-in.

## Musical anchors and bounds

All region endpoints and hold counts are absolute whole show counts. Reordering, inserting or splitting pictures leaves those anchors where they were. Splitting a transition preserves the map, total timing and its sampled picture (with the existing explicit eased-motion review). Base timing still follows destination sets. Removing or shortening moves cannot truncate a tempo range or hold: the whole edit is rejected, with no partial change. Move or remove the anchor first.

There are at most 256 regions and 256 holds. Region endpoints satisfy `0 ≤ start < end ≤ totalCounts`; BPM endpoints are finite numbers from 20 to 400. Holds have distinct whole counts before the final count, and finite durations from 0.001 to 600 seconds. Unsupported map versions, malformed numbers, overlapping regions and out-of-show anchors fail validation. Fixed-tempo projects with no map retain their original duration and samples without a migration step.

## Shared timing calculation

For a ramp starting at BPM `b`, with slope `k = (endBpm − b) / counts`, elapsed time through `x` counts is `60 × log1p(k × x / b) / k`. Its inverse is `b × expm1(k × seconds / 60) / k`. Constant regions use the existing `counts × 60 / BPM` formula. Near-zero slopes use the constant limit. Move boundaries and holds split the compiled intervals without changing a ramp's slope.

`countToSeconds` returns the earliest arrival at a count; all later counts include preceding holds. `secondsToCount` is monotonic, clamps to the show and returns the exact held count throughout each fermata. The audio worklet uses the same interval formulas as the renderer. Geometry sampling remains count-based. Compiled maps cache immutable editor snapshots; code changing timing must replace its project snapshot.

## Files and export

A production with a nonempty tempo map saves as **schema v3**, using the same `.squid` extension. Existing v1/v2 projects still open, and projects without map events still save as v2. Older applications reject v3, protecting against silently dropping timing and playing the wrong show. Raw v1/v2 files carrying `tempoMap` are rejected; removing all events restores v2 saving. The codec's internal picture/move model remains canonical v2; the v3 wire version identifies the additional required timing capability. There is no supported legacy downgrade for mapped timing.

Native saving, recovery and `.squidpack` imports/exports use the same codec and retain the map. The package container version remains 1; its embedded production uses schema v3 when required. Geometry, IDs, meter and score metadata are retained. See [wire format v3](schema-v3.md).

Mapped coordinate CSV exports label their original tempo column **Base tempo** and append **Timing map**, **Arrival seconds** and **Incoming seconds**. Arrival seconds mean show time before the held count's pause; the audio offset is separate. Ordinary CSV exports retain their existing columns. PDF books keep field/coordinate geometry and append a timing table, paginated at 20 compiled intervals per appendix page. It records all ramps, holds, start times, durations and the audio offset, instead of treating base BPM as the complete timing instruction.

## Validation and design review

[Design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. The editor reuses Modal, shared command/HelpButton routes, score-map form/table styles and theme tokens. The shared score-panel height limit respects scaled viewport dimensions, keeping the fixed header/footer reachable at 150% UI scale. The compact transport hold readout uses a full accessible status label and adds no field-height cost; recording status retains the full text in its existing lane. No physical-coordinate or print-field changes are introduced.

Source tests compare analytic ramps against independent quadrature, fractional count/time round trips, hold intervals, legacy exact durations, split trajectories, bounds, schema v3, atomic commands, exports, 256+256 events, click times at all five speeds and partial hold resume. Native tests cover v3 file/recovery/audio-package persistence. The `tempo-map` desktop owner covers native editing/keyboard paths, preview/cancel/undo, actual media/worklet timing, a renderer stall during a hold, count-in, loops, seeking and themed/scaled layouts. The print owner independently reads the native PDF appendix. [Rendered evidence and measurements](evidence/tempo-map/README.md) record the tested source and limits. Software checks make no human-listening or physical-device qualification claim. Audio-alignment anchors remain owned by #53.
