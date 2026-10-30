# Recording alignment — #53

Open **Sheet → Align recording**, **Timeline view → Align recording**, or search **Align recording** in the Command palette. Set arrivals and individual show counts can be matched to a variable-tempo recording without changing written counts, meter, performer positions or movement paths.

Enter CSV/TSV rows without headings: `Count, Recording seconds`. For example, with a count-zero offset of `0.4`, `4,2.9` places count 4 at recording time 2.9 seconds. The offset is the implicit count-zero anchor. Counts are whole numbers from 1 through the final show count, distinct and sorted on acceptance. Times must increase strictly after the offset. At most 256 anchors are supported, with each stored time after the offset in `(0, 86400]` seconds. Reversed/duplicate counts and times, invalid numeric input and out-of-show anchors prevent Apply.

The preview shows written drift (target minus the unaligned written time), saved error (target minus the currently saved recording mapping) and the candidate's residual error. Positive values mean the recording arrives later. The table is keyboard focusable and scrollable. Apply validates all rows again and commits offset and anchors together in one **Align recording** undo action. Cancel/Escape discards the draft. Pending unrelated drafts and stale project sessions cannot be overwritten. Clear all rows and Apply to remove alignment.

Expand **Waveform and tap assistance** after attaching or relinking a recording. The independent recording preview has play/pause, a waveform with anchor markers, and an arrow-key-accessible time slider. Choose a set arrival or enter a show count. **Tap / add anchor** captures the recording preview's current time and advances the count; Enter/Space works while the button has focus. While playing, successive taps produce count-to-recording anchors for tempo variation. Taps append draft rows and never commit automatically. Duplicate captures remain visible as validation errors; edit/remove the row before accepting. Automatic beat detection is not implemented.

The overview waveform uses the decoded recording's actual duration. Its bins map through the same inverse timing conversion as scrubbing and playback rather than being stretched uniformly over show counts. Waveforms are a coarse peak overview, not a sample editor. Silent or missing audio retains manual editing and aligned silent rehearsal. Anchors after the recording's end are flagged; the existing transport continues silently outside the available audio region.

## Timing policy

Let `N(c)` be nominal elapsed seconds at count `c`, including base tempos, analytic BPM ramps and the arrival at each fermata. The implicit knot is `(N(0), 0)`. An explicit anchor `(c, s)` stores `s = recordingSeconds - audioOffsetSeconds`. Between adjacent knots `(n0,s0)` and `(n1,s1)`:

```
alignedSeconds(c) = s0 + (N(c) - n0) * (s1 - s0) / (n1 - n0)
recordingSeconds(c) = alignedSeconds(c) + audioOffsetSeconds
```

After the last knot the last interval's scale continues; with no anchors the original timing is unchanged. Each interval must be between 0.05 and 20 times its nominal duration. These explicit bounds reject implausibly short/long intervals and bound metronome scheduling. Counts and tempo-curve shape are preserved; effective BPM is divided by interval scale. Fermata durations are multiplied by that scale. An anchor on a held count means the beginning of the hold. Its hold uses the following interval's scale, including extrapolation after the last anchor. Count-to-seconds and its inverse, metronome plans, count-in, silent/media playback, seeks, rehearsal ranges, loops, durations, CSV and the PDF timing appendix all consume the same compiled spans.

A rehearsal speed multiplies the aligned clock and recording rate together; it does not rewrite anchors. Pausing preserves elapsed progress, including inside a hold. Editing timing, undo/redo or reopening reconstructs the clock at the selected count's arrival. Editing the global offset in Production settings shifts all saved targets together. Editing the offset in the alignment preview keeps the explicitly entered recording times fixed while changing count zero. Negative offsets retain the established silent lead-in behavior.

Like score and tempo events, anchors refer to absolute show counts. Reordering or inserting sets leaves them at those counts; splitting a move preserves them. Resizing/removing moves is rejected if it would strand an anchor or violate the interval bounds. No automatic clamping or deletion occurs.

## Persistence and compatibility

Aligned projects use wire **schema v4**, with a nonempty `audioAnchors` list and an optional v3 `tempoMap`. All other picture/move fields follow v2. See [the schema](../format/squid-v4.schema.json) and [example](../format/examples/aligned-v4.squid). The canonical in-memory model remains version 2, as for v3 timing. Old wire versions containing `audioAnchors` are rejected; older apps reject v4 rather than silently discard alignment. Removing anchors restores v3 when a tempo map remains, or v2 otherwise.

The native codec, recovery worker and portable audio container use this same validation. Plain `.squid` contains timing metadata only. Audio is included or referenced only through explicit Portable production export; the `.squidpack` container remains version 1. Legacy sampling adapters reject aligned timing instead of claiming a lossless downgrade. Unknown informational fields retain existing read/discard behavior.

## Design review

[Design guidance](DESIGN_GUIDANCE.md) sections 1–5 apply. The editor reuses Modal, shared command/draft guards, input/table styles, theme tokens, and existing native recording attachment. Sheet and timeline-view tools expose the command; the normal field/transport layout keeps its dimensions. Assistance is collapsed on opening so alignment errors and preview are visible first. The modal body scrolls independently of its action footer. See [rendered evidence](evidence/audio-alignment/README.md) for theme, keyboard, enlarged-layout and desktop results. Cross-platform certification remains with CI; these local checks do not certify other operating systems.
