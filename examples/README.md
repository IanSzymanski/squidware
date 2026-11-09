# Example productions

## Tether (`tether-space-show.squid`)

The demo Squidware opens with. An original drum corps production in four movements, written to the **Space show** from Squidwriter: *Event Horizon*, *Gravity Assist*, *Tether* and *Reentry* (1,226 counts, 11:14).

**Cast (165, a full modern World Class corps):** 84 brass (24 sopranos, 16 mellophones, 8 trombones, 8 baritones, 12 euphoniums, 16 tubas), 24 battery (10 snares, 5 tenors, 5 basses, 4 cymbals), 13 front ensemble fixed on the front sideline, and 44 guard (24 flags, 12 rifles, 8 sabres). Soprano 1 and Trombone 1 are the soloists.

**Approach.** Form-based, curvilinear and asymmetric rather than dot-to-dot: the picture is usually a moving shape (spirals that turn and scale, conveyors on orbits, cables that reel in, debris fields), with big hits on rings, a heat shield and a closing company front. Transitions use joint minimum-travel assignment so sections never cross, and every move is checked with Squidware's own analysis.

**Tools used:** live line/arc/circle/curve formations, Bézier curves, seeded scatter (uniform, clustered, polygon regions, a pinned dot), assignment constraints (section slots, pinned soloists, role slots, ordered drum groups), shared routes, group movement (conveyors on open and closed routes, stop-go cues, follow the leader, a counter-march), cubic and scheduled paths (spiral arcs, canon "a bar apart", four-hit stabs, staggered departures), marching-direction declarations, production analysis rules with section and direction overrides, tempo map with ramps and fermatas, score map with meter changes and rehearsal marks, recording anchors, rehearsal passages, selection groups and snapping.

**Analysis.** The show opens with one deliberate finding: the rifle duet counter-march in set TE 5, where the model places both rifles on one line as they pass. The set notes explain it.

**Recording.** The release also publishes `tether-space-show.squidpack`, the same production with the Space show recording bundled. The recording was rendered from the Squidwriter score (synthesized brass, sampled percussion) and aligned with recording anchors at every set arrival that needs one. It is the project owner's own music, distributed with Squidware for this demo.

**Rebuilding.** The show is generated so it can be revised and re-checked in one step:

```
node scripts/demo-show/build.mjs          # writes examples/tether-space-show.squid and prints the analysis report
node scripts/demo-show/package.cjs <recording.mp3> <out.squidpack>
```

`scripts/demo-show/show.ts` holds the set-by-set design, `forms.ts` and `lib.ts` the authoring helpers, and `space-show-timing.json` the per-count timing exported from Squidwriter. Set `DRAFT=1` to skip the automatic stagger repair while iterating.
