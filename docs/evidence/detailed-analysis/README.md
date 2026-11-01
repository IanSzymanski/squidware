# Detailed movement analysis — software review

Issue [#76](https://github.com/IanSzymanski/squidware/issues/76). [Numerical policy and user behavior](../../detailed-path-analysis.md).

## Validation

- **716 source tests, 84 native tests and 28 contract/release checks passed.** New checks include degree-nine eased composition/derivatives, curved crossings outside chord boxes, a `.11–.12` fractional move with a collision at `.115`, asynchronous arrivals, holds/gaps, loops, tangent/near-miss distinctions, portable section/direction limits, per-track path cache invalidation, cancellation and worker revision ownership, reload and a 500-performer/128-picture/32-interval case.
- An independent test oracle uses explicit power-basis cubic/derivative evaluation and dense bracketing plus golden-section refinement on 24 deterministic random curve/loop cases. It does not consume the Bernstein controls/bounds. Worker/reference public findings agree; the synchronous API omits worker cache and broad-phase pruning.
- Numerical regressions prevent a stationary curve at a large field origin from acquiring a false peak through cancellation in a tiny time window; velocity is derived in local coordinates. Further cases cover near-stationary velocities, overflow of velocity/padded bounds, unrepresentable local midpoint times and confirmed show-count witnesses. These cases retain possible findings or explicitly unavailable moves instead of false clearance or false witness navigation.
- [Related desktop report](related-workflows.json): detailed-analysis, paths, movement-schedule, path-operations, analysis, analysis-rules and print passed. [Final replay](final-workflows.json): detailed-analysis and print passed after all runtime precision and keyboard-help changes. [Detailed report](results.json) retains exact findings, viewports and worker measurements. Reports retain their tested source identities rather than inheriting later evidence hashes.
- Native interaction covers finding filters/navigation, the exact curve overlay/ring at count 4, live curved playback, numeric path edits, immediate pending/old-overlay clearing, incremental recomputation of one changed performer, undo/redo, native save/reopen, fast between-count stride/collision findings, unresolved bounds, themes and enlarged keyboard review. Collected renderer errors/unhandled promises are empty. Focus help includes certainty, numerical precision state and the review count range.
- [Standard PDF inspection](print-inspection.txt) passed the layout/paper fixtures. [Curved and scheduled coordinate inspection](curve-print-inspection.json) passed **807 extracted word boxes across five pages**, including the new Problems/bounded-stride descriptions. The [curved](curved-coordinates.pdf) and [scheduled](scheduled-coordinates.pdf) PDFs retain arrival coordinates and blank scalar peak fields; bounded detailed peaks belong to Problems. No file-format change is required.

## Rendered review

Design guidance sections **1–5** apply. Existing Modal, Problems pagination/filters, HelpButton/focus help, theme tokens, field geometry, command navigation, history and worker providers are reused. The [default field](detailed-before.png) remains **485 px** at **1366×768**, above the approximate 470 px target. There is no additional permanent field row.

[Confirmed findings](detailed-confirmed.png) expose outward-rounded quantity bounds and a known offending count window. [Selected geometry](detailed-selected.png) highlights the actual cubic and puts both crossing performers/rings at `(20,25)` at count 4. [Pending work](detailed-pending.png) hides old flags and overlays before new worker results arrive. [Fast submoves](detailed-fast.png) retain fractional timing; [unresolved bounds](detailed-unresolved.png) stay explicit instead of claiming the target precision. A confirmed breach can remain valid when its quantity interval is wider than the refinement target.

[Dark](detailed-dark.png), [light](detailed-light.png) and [high contrast](detailed-high-contrast.png) were inspected. The [1024×720 window at 150% scale](detailed-enlarged.png) has a **683×480 CSS viewport**. The panel scrolls to the focused finding; native Return reviews it, and shared keyboard help includes its count range. The underlying field is **181.667 CSS px** in this constrained, modal-covered view, following the existing enlarged layout rather than changing the default-size field budget. Certainty and unresolved state use words in addition to the existing severity colors.

## Performance and limits

[Compute observations](performance.json), reproducible with `node scripts/detailed-analysis-performance.mjs`: one observation per phase on this host, with 128 pictures and 32 coincident cubic intervals per performer in the first move. Every pair conflicts; zero-distance pruning applies. Localized editing changes one performer's control point.

| Performers | Full ms | Cached ms | Localized ms |
| --- | ---: | ---: | ---: |
| 2 | 38.47 | 0.44 | 3.25 |
| 64 | 372.63 | 7.31 | 9.39 |
| 500 | 3119.21 | 136.14 | 246.23 |

The 500-person case reports all **124,750 pairs plus 500 stride findings**, with **5,764,287 UTF-8 bytes** in the valid encoded project, below the 10 MiB budget. This combinatorially dense case is not an upper bound for arbitrary numeric curves. Cooperative timer delays are suppressed in the compute script; it records callback gaps and the final sorting/cloning tail separately. Cached/localized output still materializes/sorts the full retained finding list, and large result delivery/rendering has ordinary UI costs.

The [actual maximum-show workflow](detailed-maximum.png) uses 500 performers/128 pictures and a curved first move, followed by ordinary moves. All **127 worker results** completed. The first detailed move checked **25,835 narrow-phase pairs in 425.4 ms**, returning 2,563 findings. Native set navigation was accepted while checks were pending; **431 renderer frames** continued. The observed longest frame gap was **180.9 ms**, including project loading/rendering and concurrent validation on this host. This demonstrates worker ownership, not a hard frame-time or school-device guarantee.

The spatial target is 0.001 yd/yd-per-count; possible temporal candidates refine toward 1/1024 count within 2,048 subdivisions/depth 32. Broad/uncertain intervals remain explicit. Numeric overflow/unrepresentable confirmed timing and existing worker timeouts report unavailable moves. No silent truncation, chord-based clearance, inferred facing, field handles or detailed split/rewire support is claimed. Ordinary analytic behavior and v1–v6 project compatibility remain unchanged.

Host: Linux x64, Node 24.19.0, pnpm 11.25.0, Electron 44.7.0, Xvfb/software rendering. Native chooser destinations are controlled; production renderer, preload, filesystem, worker, numeric/key/pointer input and sampler are real. Electron runs outside the command filesystem sandbox with Chromium sandboxing retained. D-Bus/font-metadata diagnostics are nonfatal. Hosted cross-platform confirmation belongs to the pushed PR; no human-signoff or physical-device pass is claimed. Evidence copies and benchmark-tool bookkeeping follow the recorded runtime/source checks.
