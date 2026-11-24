# Example productions

## Tether (`tether-space-show.squid`)

The demo Squidware opens with. An original drum corps production in four movements, written to the **Space show** from Squidwriter: *Event Horizon*, *Gravity Assist*, *Tether* and *Reentry* (1,226 counts, 11:14).

**Cast (165, a full modern World Class corps):** 84 brass (24 sopranos, 16 mellophones, 8 trombones, 8 baritones, 12 euphoniums, 16 tubas), 24 battery (10 snares, 5 tenors, 5 basses, 4 cymbals), 13 front ensemble fixed on the front sideline, and 44 guard (24 flags, 12 rifles, 8 sabres). Soprano 1 and Trombone 1 are the soloists.

**Approach.** Form-based, curvilinear and asymmetric rather than dot-to-dot: the picture is usually a moving shape (spirals that turn and scale, conveyors on orbits, cables that reel in, debris fields), with big hits on rings, a heat shield and a closing company front. Transitions use joint minimum-travel assignment so sections never cross, and every move is checked with Squidware's own analysis.

**Tools used:** live line/arc/circle/curve formations, Bézier curves, seeded scatter (uniform, clustered, polygon regions, a pinned dot), assignment constraints (section slots, pinned soloists, role slots, ordered drum groups), shared routes, group movement (conveyors on open and closed routes, stop-go cues, follow the leader, a counter-march), cubic and scheduled paths (spiral arcs, canon "a bar apart", four-hit stabs, staggered departures), marching-direction declarations, production analysis rules with section and direction overrides, tempo map with ramps and fermatas, score map with meter changes and rehearsal marks, recording anchors, rehearsal passages, selection groups and snapping.

**Analysis.** The show opens with one deliberate finding: the rifle duet counter-march in set TE 5, where the model places both rifles on one line as they pass. The set notes explain it.

**Recording and redistribution.** The repository and app ship **without a recording**. The drill, score timing, tempo map, recording anchors and metronome work without audio. No redistribution license for a Space show recording or its instrument samples is recorded here, so releases must not promise or include that recording until those rights are documented. The timing data describes the Squidwriter Space show; it is not an audio file or a license to redistribute one.

You can attach your own authorized recording. The optional packaging command below bundles a recording you supply; it does not download audio or establish redistribution rights.

**Rebuilding.** The show is generated so it can be revised and re-checked in one step:

```
node scripts/demo-show/build.mjs          # writes examples/tether-space-show.squid and prints the analysis report
node scripts/demo-show/package.cjs <recording.mp3> <out.squidpack>
```

`scripts/demo-show/show.ts` holds the set-by-set design, `forms.ts` and `lib.ts` the authoring helpers, and `space-show-timing.json` the per-count timing exported from Squidwriter. Set `DRAFT=1` to skip the automatic stagger repair while iterating.

**Validation.** `pnpm test` checks the cast, fixed front ensemble, every set arrival against the source score timing (within 1 ms), and the single explained teaching finding. After `pnpm build`, run `pnpm test:workflows --suite=demo-show`. This suite is also part of the Windows/macOS/Linux desktop certification plan. It loads the real bundled demo, verifies clean startup and Explore the demo, preserves its authored rules despite different personal defaults, checks all 66 moves through the production worker, measures playback frame cadence, and tests real media seeks at all 67 arrivals and playback in all four movements. Existing desktop suites keep the smaller Tidal forces fixture.

The suite generates test-only silence for the media clock. This verifies transport against the authored timing data, not audible synchronization to an unavailable music recording. Its `results.json` records startup readiness, median/p95 frame intervals, native media readings and source provenance; `tether-1366.png` captures the 1366 × 768 default layout with the shared design guidance's minimum 470 px field height. Performance values describe the test host against the [documented investigation targets](../docs/performance.md#fixtures-and-budgets).

See the [recorded demo validation and design review](../docs/evidence/demo-show/README.md).

## 3D leg motion prototype

Run `pnpm dev` and open `/examples/leg-motion/` on the local Vite server. The example opens paused with 64 performers. Choose a motion, scrub the count, or play it at different speeds. Use Front, Side, and Press box to inspect the poses, or switch to Whole ensemble and load the 500-performer cast. Turn off **Animate legs** to compare the standard static markers at the same count.

The [design and validation notes](../docs/evidence/leg-motion/README.md) cover the rig contract, captured poses, and software-rendering costs.

## Low-poly 3D asset preview

Run `pnpm dev` and open `/examples/3d-assets/` on the local Vite server. Choose carried equipment or a front-ensemble station to review one model. The 64- and 500-performer scenes support playback, scrubbing, stage context and comparison with ordinary markers. See the [asset inventory, rendered review and measurements](../docs/evidence/3d-assets/README.md).

## Count-timed choreography review

Run `pnpm dev`, open `/examples/leg-motion/`, and choose **Plié and flag cues**. Scrub from 0 to 8 or play the phrase in a loop. Use the front, side, and press-box cameras to inspect foot turnout, knee flexion, and the flag grip. For editable cues in the editor, open [the v15 example](../format/examples/choreography-v15.squid). The [choreography design review](../docs/evidence/choreography/README.md) includes the pose sequence and verification results.
