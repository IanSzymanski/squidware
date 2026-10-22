# Performance baselines

Issue [#3](https://github.com/IanSzymanski/squidware/issues/3) establishes evidence before the collision, thumbnail, playback, recovery, and 3D changes. The maintainer removed the remaining representative school-laptop gate on 2026-10-22; the issue is complete on the delivered local measurement scope under the [validation policy](VALIDATION_POLICY.md). The checked-in local results describe the actual development desktop; they do not qualify school hardware.

## Fixtures and budgets

`src/performanceFixtures.ts` generates projects without dates, randomness, network, or storage dependencies. Both use UUID-shaped identifiers and normal v1 project serialization. `demo` has 64 performers and 6 sets. `maximum` has the supported maximum of 500 performers and 128 sets, with every performer positioned in every set. The maximum fixture uses a dense lattice with alternating adjacent columns so the transition into set 2 exercises nearby performers and crossing trajectories. The fixture test checks validity, stable content, limits, unique identifiers, round trips, and collision coverage.

The working edit budget is **16.7 ms of main-thread work** for a 60 Hz frame. Drag and playback frame cadence should stay near 16.7 ms. These are investigation targets, not guarantees from an isolated Node benchmark. Capture median and p95 together: a fast median cannot excuse a slow tail. Second-rAF latency is recorded as a latency proxy; it naturally includes two frame opportunities and is not judged as one frame of CPU work. No school-laptop pass is implied by any local result.

## Reproduce

Use the repository's lockfile and its Node/pnpm versions. Run measurements sequentially on an otherwise idle machine, after stopping development servers, builds, tests, and other profiling runs. Preserve a copy of the **before** production build before editing; the harness does not rebuild or restore code.

```powershell
pnpm install --frozen-lockfile
pnpm perf:fixtures
pnpm build
pnpm perf:compute --label=working-tree --repetitions=50 --warmup=10
pnpm perf:electron --label=working-tree --repetitions=50 --warmup=5 --frame-window-ms=2000
```

Options use `--name=value`. `perf:fixtures` accepts `--output`; `perf:compute` accepts `--domain`, `--output`, `--label`, `--repetitions`, and `--warmup`. `--domain` can point to an archived CommonJS bundle of the before domain implementation. `perf:electron` accepts `--build`, `--output`, `--label`, `--fixture=demo,maximum`, `--repetitions`, `--warmup`, and `--frame-window-ms`. Fixture names, bounded integer options, and the production `index.html` are checked before launch.

For comparisons, use separate output directories and the same fixtures, machine, Electron version, viewport, warmups, repetitions, and frame window. Record the label, build SHA-256, fixture SHA-256/size, timestamp, operating system, CPU, logical cores, RAM, Node, Electron, Chromium, and GPU. Keep the raw reports, traces, and CPU profiles alongside the summary. Rerun after any measured build changes.

After collecting `before-compute.json`, `after-compute.json`, `before-electron/report.json`, and `after-electron/report.json` under `.qa/performance`, run `node scripts/performance-report.mjs --output=docs/performance/comparison.json`. This produces a compact comparison only when the fixture hashes, machine/runtime metadata, repetitions, warmups, Electron versions, and runner/preload fingerprints match. It rejects failed/timed-out runs, stale reports that do not match the current manifest, and incomplete fixture inventories. The Electron launcher saves `run.log` and `run-status.json`, with a five-minute watchdog; failed runs must not be treated as measurements.

The October 12 local run needed approval to launch Electron outside the Codex process sandbox because Windows denied the Electron install's sandbox-token file access. The Electron renderer itself remained sandboxed, with context isolation enabled and Node integration disabled. Do not fix a runner launch failure by disabling the application's Electron sandbox.

## What the reports measure

**Node compute.** Each fixture is validated and serialized before measurement. After 10 warmups, each operation runs 50 times and retains its raw durations. The report separates transition analysis, position sampling, stringify, legacy stringify-based edit equality, validation, serialization, and parsing. Serialization includes validation; parsing includes JSON parsing and validation. Node heap/RSS snapshots include transient allocation. These values are compute costs, not editor interaction latency.

**Production Electron.** A separate isolated profile receives the fixture as recovery data before the actual production bundle loads. A hidden offscreen 1440×1000 window runs with background throttling disabled, the production preload, sandbox enabled, context isolation enabled, and Node integration disabled. The runner verifies the expected performer/set counts and checks renderer errors before profiling. It switches to set 2, selects a performer, warms up five alternating left/right keyboard edits, and records 50 edits. It verifies that each edit changes that performer's displayed position.

For every keyboard edit, the report separates synchronous event dispatch, elapsed time until the next task, React commit latency, trace-derived main-thread task occupancy, first-rAF latency, and second-rAF paint opportunity. `RunTask` durations are main-thread task **wall time**, including measurement overhead and possible OS descheduling; they are not exact process CPU time. Tracing separately records delayed recovery saves, style/layout/paint events, and other work outside the edit interval. CPU profiles can be opened in Chromium DevTools for sampled call stacks.

The runner sends 60 real Electron mouse moves at approximately 16 ms intervals, then releases at a different position. It verifies a changed performer position and captures rAF cadence over the configured window; a two-second capture includes roughly one second of dragging and an idle remainder. It also captures two seconds of actual playback and two seconds of paused 3D after one second of settling. Playback must advance both the playhead count and performer positions. 3D must initialize a canvas and draw successfully; WebGL context loss and later renderer errors fail the run. Each phase records React commits, application rAF callback counts, WebGL draw calls, main-thread task occupancy, and long tasks. Frame summaries report raw intervals, median/p95, intervals over 16.7 ms with a 1 ms jitter tolerance, and intervals over 33.3 ms.

The DevTools hook counts components with performed-work flags during commits; production component names are minified and these counts are diagnostic, not a stable component API. The keyboard count window includes warmups. Memory snapshots before keyboard edits, after edits/recovery settling, and after 3D use CDP heap counters and Electron process metrics. Heap values are bytes; Electron process memory is KiB. The heap is not forced through GC, so snapshots cannot establish retained project size or a leak.

Instrumentation, CDP tracing, CPU sampling, rAF/WebGL wrappers, and the fiber hook add overhead. An offscreen renderer does not measure physical display scanout, native menus, or file dialogs. Initial DOM mount is timed separately from fixture readiness, which includes switching sets and a deliberate one-second settling interval. The rAF loop used to observe frames is excluded from application rAF counters.

## Recorded local evidence

The measured summary is stored in `docs/performance/local-2026-10-12.json`. Raw artifacts live under `.qa/performance/` and are ignored by Git because Chromium traces and fixture copies are large. Preserve those artifacts when sharing a measurement; summary numbers alone are insufficient for a profile investigation.

Measured October 12, 2026 on Windows 10 (10.0.19045), an AMD Ryzen 7 3700X with 16 logical CPUs and 34,282,377,216 bytes of RAM, and an NVIDIA GeForce RTX 5070 (driver 32.0.16.1088, ANGLE D3D11). Runtime versions were Node 24.19.0, Electron 44.7.0, and Chromium 152.0.7977.130. The production before/after builds, runner, preload, domain bundles, and fixtures are fingerprinted in the JSON summary. The final measurements ran sequentially while repository builds, tests, packaging, and other Electron runs were paused. There is one before/after run pair; this is not a statistical hardware qualification.

Both fixtures passed all interaction, playback-progress, WebGL, and renderer-error checks. Each compute operation has 50 samples after 10 warmups. Each Electron edit metric has 50 samples after 5 warmups; drag, playback, and idle 3D windows are 2 seconds. Values below are **median / p95 in milliseconds**.

| Production Electron metric | Before | After |
| --- | ---: | ---: |
| Demo keyboard edit main-thread task time | 2.78 / 3.77 | 3.43 / 4.50 |
| Maximum keyboard edit main-thread task time | 93.81 / 155.12 | 86.90 / 147.06 |
| Maximum synchronous event dispatch | 0.20 / 0.40 | 13.50 / 32.90 |
| Maximum commit latency | 92.20 / 115.50 | 85.45 / 110.10 |
| Maximum second-rAF paint opportunity | 136.10 / 172.20 | 125.70 / 162.20 |
| Demo drag frame interval | 16.70 / 16.70 | 16.70 / 16.70 |
| Maximum drag frame interval | 16.70 / 16.80 | 16.70 / 16.80 |
| Demo playback frame interval | 16.70 / 16.70 | 16.70 / 16.70 |
| Maximum playback frame interval | 33.30 / 33.40 | 16.70 / 33.40 |

At the original A02/store-extraction measurement, maximum-project keyboard edits exceeded the 16.7 ms task budget in both builds. That measured store retained whole-project stringify equality and validates edits against the previous immutable snapshot: metadata, roster, section, and whole-list set checks run every time, while geometry validation covers changed set objects. Performer identity or field-dimension changes, imports, and serialization still receive full validation. The controller also derives a whole-project dirty signature. The command/store extraction is an architecture change; the lower maximum median in this single run pair does not establish a hardware-qualified performance improvement. Full transition analysis, thumbnail work, snapshot undo, synchronous recovery, and dynamic SVG work still need their dedicated follow-up issues.

| Maximum fixture isolated Node compute | Before | After |
| --- | ---: | ---: |
| Transition analysis | 22.52 / 24.04 | 24.07 / 25.20 |
| Position sampling | 0.13 / 0.22 | 0.15 / 0.29 |
| Whole-project stringify | 18.28 / 20.44 | 19.58 / 23.46 |
| Legacy stringify equality (two projects) | 35.47 / 39.06 | 39.82 / 46.86 |
| Full-project validation | 26.68 / 28.84 | 31.28 / 35.54 |
| Validated serialization | 45.14 / 48.78 | 50.20 / 54.13 |
| Parse and validate | 63.19 / 69.79 | 70.05 / 79.88 |

These isolated compute operations are not additive estimates of an Electron frame. In particular, renderer dispatch/commit scheduling differs from a Node loop. The summaries preserve their separation rather than converting compute timings into an editor-frame claim.

Paused 3D recorded **121 application rAF callbacks and 2,299 WebGL draw calls over approximately 2 seconds**, for each fixture in both builds. Continuous rendering remains measurable even while the show is paused, supporting the investigation in issue #15. Keyboard edit periods had 110 React commits in both builds, including 5 warmups plus 50 measured edits. The maximum keyboard phase recorded 56 before and 55 after main-thread tasks longer than 50 ms; these phase counts also include warmups and ancillary task work.

After 3D, the maximum renderer heap snapshots were 60.0 MiB before and 99.5 MiB after; renderer working sets were 576.1 MiB and 548.1 MiB. These uncollected snapshots include instrumentation and transient allocations and do not establish a leak or retained-memory regression. Full before-edit, after-edit, and after-3D snapshots, recovery-write durations, minified component counts, and phase occupancy are retained in the summary.

The raw files are `before-compute.json`, `after-compute.json`, and `before-electron/` / `after-electron/` under `.qa/performance/`. Each Electron directory contains the manifest, successful run status, log, `report.json`, `demo-trace.json`, `maximum-trace.json`, `demo.cpuprofile`, and `maximum.cpuprofile`. Traces are Chromium trace-event JSON; CPU profiles are DevTools-compatible sampling profiles.

## Demand-driven 3D — issue #15

The October 13 local comparison uses the production build at `60c1b477d6316ebdd3c036c078fe3d17c709b077` as the before behavior. The detailed machine, fixture and build fingerprints and lifecycle checks are saved in [stage3d-comparison.json](performance/stage3d-comparison.json). The test ran sequentially in isolated, hidden offscreen 1440×1000 Electron windows with the actual preload, renderer sandbox and context isolation enabled, on an Intel i7-10510U / Intel UHD Graphics development laptop. It does not claim representative school-laptop qualification; that requirement was removed on 2026-10-22.

| Metric | Before | After |
| --- | ---: | ---: |
| Startup JavaScript requested (uncompressed local bytes) | 841,984 | 333,394 |
| Demo paused 3D, application rAF callbacks / 2 seconds | 119 | 0 |
| Demo paused 3D, WebGL draw calls / 2 seconds | 2,261 | 0 |
| Maximum paused 3D, application rAF callbacks / 2 seconds | 120 | 0 |
| Maximum paused 3D, WebGL draw calls / 2 seconds | 2,280 | 0 |

Startup scripts are captured from actual CDP requests, because file URLs do not expose reliable Resource Timing entries. The after startup requests omit both the Stage3D and Three.js chunks. The 60.4% byte reduction describes locally requested JavaScript, not network compression or measured startup latency. Draw calls and application frame callbacks establish idle rendering activity; they do not measure GPU watts or physical screen presentation.

The renderer keeps its context for section recoloring, field markings, roster addition/removal, empty-roster undo, positions and selection changes. Growing the 64-member roster to 65 expands instance buffers without replacing the field, camera or renderer. Camera presets and orbit damping redraw and settle; playback redraws on count changes and pause settles to zero callbacks and draws. The lightweight choice disables shadows and caps pixel ratio at 1; it survives switching between 2D and 3D during the current editor session. The quality-change windows recorded fewer draw calls per application frame in lightweight mode (12 versus 19), including any settling frames.

For each fixture, five created contexts were released or lost across repeated view switches and injected context loss. Every created instance/geometry buffer was explicitly deleted (262/262 for the demo and 255/255 for maximum). Texture and program deletion calls were also observed; context release frees renderer-internal resources that are not individually deleted by Three.js. Both injected graphics-context loss and a blocked lazy module request returned to a usable 2D editor. Existing desktop file and editor workflows still pass.

To reproduce, preserve the before `dist` folder before building the change, then run:

```powershell
node scripts/stage3d-qa.mjs --baseline --build=.qa/stage3d/before-build
pnpm build
pnpm test:3d
```

The runner uses the shared deterministic demo and maximum fixtures and a fresh local profile for each run. Raw manifests, reports and screenshots are kept under `.qa/stage3d/before` and `.qa/stage3d/after`. A failed run removes the previous report rather than leaving stale success evidence. The targeted checks cover cold module requests, idle activity, camera motion, roster growth/removal/undo, color and field texture changes, selection/positions, quality, playback/pause, resource disposal and both failure paths.

## Physical-hardware qualification removed

The maintainer removed all human and physical-hardware gates on 2026-10-22. The delivered production Electron protocol, baseline report and investigation budgets fulfill #3's remaining measurement scope. Running this protocol on other hardware is optional and does not block implementation or release. Existing results do not qualify untested machines or establish an end-to-end 16.7 ms maximum-project pass. Preserve host metadata and distinguish measured results from untested environments.

## Named history (issue #6)

The A02 snapshot and JSON-equality behavior at commit 53302a4 is compared with named reversible patches on the same 500-performer, 128-picture v2 fixture and local Intel i7-10510U Windows host. Five GC-controlled trials per workload each use 20 warmup edits and 80 timed edits. Both implementations use the current v2 validation and command reducers. The report records exact after-source hashes, every timing sample, heap observations and hardware: [history-comparison.json](performance/history-comparison.json).

| Maximum fixture workload | Snapshot median / p95 (ms) | Patch median / p95 (ms) |
| --- | --- | --- |
| Notes | 33.48 / 40.23 | 1.82 / 2.16 |
| Coordinates | 44.04 / 61.82 | 2.26 / 2.99 |

Median retained heap above the pre-store baseline was 8.9 → 5.02 MiB for notes and 9.2 → 5.04 MiB for coordinates. These values include the validated live project, history and saved-state metadata. They are not history payload alone, peak allocation, Electron working set or a total application memory bound.

Store edit medians improved by about 95 percent in these local runs. This isolates edit dispatch from React rendering, full transition analysis and deferred recovery; it does not establish an end-to-end 16.7 ms edit-frame pass or school-laptop qualification. The History panel documents the 80-action / 16 MiB estimated-payload policy and always-kept latest-action exception. Pending text/color drafts commit once; undo/redo and dirty comparisons use revision IDs rather than serialization. Native recovery remains separately tracked by #7.

Reproduce with node scripts/history-performance.mjs and an exact --before-ref commit if changing the baseline. Standard app/desktop tests and the production editor workflow verify correctness independently of the benchmark.

## Thumbnails and selection (issue #10)

A production Electron comparison on October 13, 2026 uses the same 500-performer, 128-set fixture, including one empty section. The baseline is main at `30c8e5ba66dabd73accffb645f09238a1d716c25`. The after build uses narrow thumbnail positions/color inputs and cached immutable selection membership. [thumbnail-comparison.json](performance/thumbnail-comparison.json) records the build fingerprints, after-source hashes, hardware, counters and edit-cost summaries.

| Maximum production work | Before | After |
| --- | ---: | ---: |
| Thumbnail renders for one dot edit / undo / redo | 128 each | 1 each |
| Thumbnail renders for set text, move timing or performer name | 128 each | 0 |
| Thumbnail renders for a used section color or visible section assignment | 128 | 128 |
| Thumbnail renders for an unused section color | 128 | 0 |
| Thumbnail renders during playback | 0 | 0 |
| Selection Set builds / array membership scans during the sampled playback | 5 / 5,000 | 0 / 0 |

Thumbnails receive each picture's immutable positions and a shared array of performer IDs/colors. Metadata and timing changes do not affect these props. Changes to visible roster membership/order/colors invalidate the array; names, labels, unused colors and assignments between equal colors retain it. Cast, legend, Inspector derivations and field selection reuse a WeakMap-cached ReadonlySet for each immutable selected-ID array. Section groups, filtered Cast, selected performers and selection center remain stable when their inputs are unchanged. Empty sections no longer show selected merely because another section is selected.

The local Ryzen 7 3700X / Windows 10 host recorded command dispatch median/p95 **2.00/2.20 → 1.90/2.10 ms** and command-to-React-commit latency **43.40/47.90 → 12.65/13.00 ms** in one sequential before/after pair (20 edits after five warmups). These are host observations, not CI timing gates, hardware-qualified budgets or physical presentation measurements. The broader field/playback subscription work remains #11; representative school-laptop qualification is not a release gate.

The runner hooks the actual production React renderer and editor commands in a fresh profile. Render-work counters identify newly committed thumbnail component fibers, excluding retained bailout subtrees with stale PerformedWork flags. Counter sampling and edit timing are separate; timing disables Fiber-tree traversal. The fixture checks actual coordinates/colors/counts plus Cast/legend selection, empty sections, reassignment, removal, undo/redo and playback. CI gates exact invalidation/cache counts and correctness, while retaining timing samples without a flaky wall-time threshold.

Reproduce from an unchanged baseline build with `node scripts/thumbnail-qa.mjs --baseline`, then build the change and run `pnpm test:thumbnails`. Raw results and isolated profiles go to `.qa/thumbnails/before` and `.qa/thumbnails/after`. This targeted runner avoids relying on minified component names. App tests cover additional same-color, roster-order, empty-roster and immutable-cache cases. The editor, keyboard-accessibility and 3D lifecycle checks cover the existing user workflows independently.


## Background collision analysis (A08)

Measured October 21, 2026 on Linux 6.18.55, AMD EPYC 9V74 (3 visible logical CPUs, 10,452,471,808 bytes RAM), Node 24.19.0. The same A02 demo (64 performers × 6 sets) and maximum (500 × 128) fixtures are used. [Raw samples, source/fixture hashes and hardware](performance/analysis-comparison.json) contain 50 repetitions after 10 warmups. Reproduce with `pnpm perf:analysis`. These are same-host isolated compute comparisons; worker scheduling and UI rendering are measured separately.

| Node compute · median / p95 ms | Demo | Maximum |
| --- | ---: | ---: |
| Brute-force reference | 0.29 / 1.21 | 15.66 / 22.39 |
| Swept bounds, cold move | 0.22 / 1.08 | 2.64 / 3.76 |
| Cached move | 0.04 / 0.08 | 0.73 / 1.08 |
| One-performer edit | 0.05 / 0.29 | 0.80 / 0.90 |

For the maximum incoming move, broad-phase filtering reduces exact checks from 124,750 pairs to 3,839. A localized edit checks 7 pairs and reuses unrelated results. Five full-show passes measured median 1899.64 ms for the reference and 284.59 ms for cold optimized moves. Compute-only runs suppress cooperative yields so the work itself can be compared; production enables them and runs entirely in a Web Worker. Dense coincident forms still check all pairs and are covered by exact oracle tests.

The original A02 Windows maximum analysis baseline was 22.52 / 24.04 ms before extraction and 24.07 / 25.20 ms afterward. Those historical results use a different machine/platform and are context, not a same-host speedup denominator. The current comparison retains the current schema-v2 brute-force implementation as its reference.

Production Electron 44.7.0 on Linux/Xvfb loads the bundled worker under the desktop CSP and accepts a native keyboard nudge while analysis delivery is held. The `analysis` suite records worker elapsed time and 30 rapid store dispatches; those exclude total paint latency and do not establish a 60 fps editor. The `playback` suite separately passes native maximum-size dragging and preview isolation. See [background-check behavior](BACKGROUND_ANALYSIS.md) and [desktop evidence](evidence/analysis/README.md). Physical school-device qualification is not required. The documented whole-application budgets remain investigation targets; these results alone do not justify a WebAssembly change.
