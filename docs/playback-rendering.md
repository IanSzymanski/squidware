# Playback and static field rendering (#11)

The playback clock writes counts into the editor store. Only the field and timeline subscribe to fractional count changes. The shell observes playing/editability and set arrivals so navigation and Inspector context remain correct, without observing every count. The field alone observes its exact-arrival state. Playback of a move leaves Cast, Inspector controls and the root shell idle; selecting a different set, starting/stopping, recovery status changes and other real UI state changes still update them.

`sampleTimeline` returns set index, linear count progress and local count without reading performer positions. The clock and scrub command use it; `sampleProject` uses the same boundary rules and interpolates geometry only for consumers that need positions. This removes the clock's duplicate 500-performer geometry allocation each frame. Ease affects positional progress, while count progress remains linear.

`StaticFieldMarkings` is a memoized SVG layer keyed only by field width, height, preset and grid visibility. Performer movement, selection, paths, labels, keyboard focus and drag previews do not invalidate it. Zoom, pan, fit and resize change the enclosing SVG viewport. Changing the preset or grid invalidates the layer. The same drawing remains available to SVG and PDF exports.

Drag previews remain local to `Field2D`; pointer release dispatches one committed position action. Canceling a gesture discards its preview. No per-frame project snapshots or history entries are created.

## Repeatable verification

Run `pnpm test`, `pnpm build`, then `pnpm test:playback`. The production Electron runner creates a deterministic 500-performer, 128-set production and installs a React DevTools commit observer before loading the renderer. It counts newly committed component fibers rather than retained bailout flags. Recovery writes settle before measurements so their real status updates are excluded from playback-only results.

The Windows run verified 12 fractional scrubs with 12 timeline renders and zero shell, Inspector-count or static-marking renders. Actual clock playback and Cast playback retain those unrelated layers. Real pointer drags leave the project revision unchanged through six preview frames, then create exactly one undoable action. Grid/preset changes each redraw markings once; zoom/fit/resize redraw them zero times. Boundary navigation, selection highlighting and preview recovery remain synchronized. Linux CI runs the same suite. Reports include source/build fingerprints and host metadata under `.qa/playback/`.

All 207 application tests, production build, 28 editor workflows, six keyboard/accessibility workflows, and forced-fallback tooltip checks passed locally on Windows. Existing migration tests compare sampled geometry/timing with the frozen v1 engine. These observations establish invalidation behavior, not a frame-rate claim or school-hardware acceptance (#3).

## Timeline reassessment (#31)

As of 2026-10-14, #31 remains open in v0.7. The current timeline still uses nine evenly spaced labels, lacks horizontal zoom/pan and count-step commands, and starts its set track at the second set. The field's preview banner supplies move-local count information, but the requested set-local/show-absolute timeline readout remains unfinished. Its issue history shows triage and milestone assignment, with no linked implementation PR or comments. The schema and playback foundations preserve opening count zero and move boundaries; they do not fulfill #31's navigation acceptance criteria. Keep #31 open and retain its v0.7 scope.
