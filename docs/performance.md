# Performance baselines

Issue [#3](https://github.com/IanSzymanski/squidware/issues/3) establishes evidence before the collision, thumbnail, playback, recovery, and 3D changes. It remains open until the same production Electron protocol has run on a representative school laptop. The checked-in local results describe the actual development desktop; they do not qualify school hardware.

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

Maximum-project keyboard edits exceed the 16.7 ms task budget in both builds. The current store retains whole-project stringify equality and validates edits against the previous immutable snapshot: metadata, roster, section, and whole-list set checks run every time, while geometry validation covers changed set objects. Performer identity or field-dimension changes, imports, and serialization still receive full validation. The controller also derives a whole-project dirty signature. The command/store extraction is an architecture change; the lower maximum median in this single run pair does not establish a hardware-qualified performance improvement. Full transition analysis, thumbnail work, snapshot undo, synchronous recovery, and dynamic SVG work still need their dedicated follow-up issues.

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

The October 13 local comparison uses the production build at `60c1b477d6316ebdd3c036c078fe3d17c709b077` as the before behavior. The detailed machine, fixture and build fingerprints and lifecycle checks are saved in [stage3d-comparison.json](performance/stage3d-comparison.json). The test ran sequentially in isolated, hidden offscreen 1440×1000 Electron windows with the actual preload, renderer sandbox and context isolation enabled, on an Intel i7-10510U / Intel UHD Graphics development laptop. It does not complete the representative school-laptop acceptance in #3.

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

## School-laptop acceptance still required

Run this protocol on a school laptop that represents the intended audience, with its hardware and power mode documented. Inspect traces for maximum-project edits, drag, playback, and idle 3D; record median/p95, long tasks, recovery writes, memory, and frame cadence. Use these results to set hardware-qualified budgets for the dependent issues. Keep issue #3 open until those measurements and the resulting budgets are reviewed.
