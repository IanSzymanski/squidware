# Measures, meter changes, pickups and rehearsal marks

Open **Sheet → Score map**, **Timeline view → Score map**, or search **Score map** in the Command palette. Musical structure shares one count axis with the existing drill, audio clock and rehearsal passages. It never changes positions, move counts, written tempos or count-to-seconds conversion.

One drill count is one denominator beat; BPM means counts per minute. Thus 6/8 at 120 has six eighth-note counts per bar, rather than 120 dotted-quarter beats per minute. The opening meter defaults to 4/4 and group `[4]`, including legacy files with no metadata. Existing saved `meter` remains the opening meter; missing `score` is interpreted as first measure 1, no pickup, no changes and no marks, without modifying the file.

## Editing and navigation

In the sheet, a read-only measure/beat position appears with each set number. **Meter** edits the opening meter or an explicit change at that row’s arrival; blank later cells inherit the map and remove an explicit change at that count. **Mark** sets or clears a rehearsal label at that arrival. Both columns participate in validated CSV/TSV paste and one-step undo. Meter notation is `numerator/denominator:groups`, for example `6/8:3+3` or `7/8:2+2+3`. Omit groups for a single bar accent, except compound eighth-note meters divisible by three, which default to groups of three. Empty inherited cells show their current meter as a placeholder.

The Score map dialog handles events at any whole show count, including inside a move. Choose the opening meter, first full measure number and pickup count, then enter CSV/TSV rows without headings: **Count, Meter, Mark**. Supply a change, a mark or both; quote labels containing commas or quotes. Blank meter means no change on that row, and blank mark means no label. Remove a row to remove that event. All changes appear in a read-only score preview; Apply validates again and creates one named undo action. Cancel/Escape leaves data and history unchanged. Pending drafts block save/replacement and stale project revisions cannot apply.

Rehearsal navigation uses the saved map. Enter a measure and beat (fractions allowed), or choose a rehearsal-mark button. The dialog shows the corresponding absolute count. Apply map edits before navigating. Navigation stops playback, clears an active rehearsal range, moves the timeline to that count and creates no history entry. Timeline mark buttons use the same command; crowded marks are grouped and open the complete list. Rehearsal passage target descriptions include the same musical positions while retaining their original stable set/move references.

The timeline ruler can show Measures or Show counts through Timeline view. Measure labels are thinned at low zoom; all marks remain accessible in Score map. The transport always shows the musical position with its current rehearsal label beside the original show/move readouts. Musical labels share the existing ruler and transport footprint, preserving field height.

## Pickup and boundary semantics

The pickup contains the final `P` beats of the measure preceding the first full measure. With first measure 1, a two-count pickup in 4/4 maps show count 0 to **M0, beat 3**, count 1 to **M0, beat 4**, and count 2 to **M1, beat 1**. A pickup must be an integer from zero to one less than the opening numerator. An incomplete ending measure is allowed.

A meter change must land on an existing full-bar boundary. It begins the next measure in the new meter, without resetting measure numbering or drill time. For a two-count 4/4 pickup, boundaries are counts 2, 6, 10, etc.; a change at 10 to 6/8 produces M3 at count 10 and M4 at count 16. A change at 22 to 7/8 produces M5 there. Conversion back from measure/beat returns the exact count, including fractions. Unwritten pickup beats, beats beyond a meter’s bar and positions beyond the show produce errors instead of clamping.

Score anchors are **absolute show counts**, independent of set identities. Editing, inserting or reordering drill sets leaves musical events at those counts. Shortening a show past an event, truncating a bar at a meter change, or changing an opening meter/pickup to contradict later boundaries is rejected atomically. Remove/relocate the event or correct the meter first; errors identify the count and next legal boundary. This policy preserves the score’s timing while the writer changes drill. Tempo ranges, ramps and fermatas use the separate [tempo map](tempo-map.md); audio alignment anchors remain #53.

The metronome receives compiled score spans and uses their pickup/bar/group phase for every show click, start cue and loop boundary. Count-in uses the meter and tempo at its requested starting count, even after a meter change. For example, Play at count 10 in the map above gives a six-count compound lead-in and starts the show at M3. Session speed/count-in settings remain separate from saved score data.

## Saved data and bounds

The v2 format adds optional `score: { firstMeasure, pickupCounts, changes, marks }`. Each change is `{ count, meter }`; each mark is `{ count, label }`. Arrays are canonicalized into count order. First measure is 1–1,000,000; at most 256 changes and 256 marks are allowed. Counts are whole nonnegative show counts (changes start after zero), constrained by the current show duration. Labels contain 1–80 characters without control characters, and are unique ignoring case. Two changes cannot share a count; labels at one count must be combined. Meter validation retains 1–32 denominator beats, denominator 2/4/8/16 and positive groups summing to the numerator. Limits come from `PROJECT_LIMITS`.

The canonical browser/native/recovery codec validates both structure and musical consistency; JSON Schema covers structural bounds. [Score example](../format/examples/score-v2.squid) is covered by both. Older v2 applications discard optional score metadata when saving, just as they discard optional meter metadata; current applications retain it through save/reopen and undo/redo. Geometry and time sampling remain compatible with legacy files.

[Design and validation evidence](evidence/score-map/README.md) covers shared guidance sections 1–5, pointer/native keyboard paths, actual worklet accents, maximum event editing, persistence, supported themes and narrow/enlarged views. These are software-host observations; hosted cross-platform certification and package verification remain separate checks.
