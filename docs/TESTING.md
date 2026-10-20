# Test ownership and execution

Tests should identify broken user behavior or a violated boundary. Adding another end-to-end path for an already-owned contract makes the suite slower without necessarily making it safer. Start with this map before adding a regression.

## Local and hosted certification

Run `pnpm certify` to perform the complete certification for the current OS: frozen dependency install, source/contracts, Electron/Python setup, a fresh production build, native tests, all registered production desktop suites, independent PDF inspection, unpacked packaging, and packaged startup/recovery. Install Node 24, pnpm 11.25.0 and Python 3.12 first. `SQUIDWARE_PYTHON` can select an explicit Python executable. Linux also needs Xvfb; `--configure-sandbox` explicitly permits the two `sudo chown/chmod` pairs used by hosted CI for Electron and the packaged Chromium helper.

CI uses the same plan split into `pnpm certify --layer=source` and `pnpm certify --layer=desktop`: source/contracts run once, then the desktop phase runs on Windows, macOS and Linux. A local pass certifies only its recorded OS. The `CI required` job succeeds only when both hosted layers succeed; failed, skipped and cancelled dependencies fail that gate. Configure main's required status checks to require **CI required**; adding the job to YAML alone does not enable repository branch protection.

Certification reports and per-step logs live in `.qa/certification/<run-id>/`. Every planned step has a status, including `not_run` after an earlier failure. Reports identify source revision/tree, dirty state, working-content and lockfile hashes, runtime/OS/image, workflow run and built output. Dirty development builds are supported: the working-content hash must still match. Committing those identical contents does not require a redundant rebuild. Git revision and tree record provenance; raw working-content hashes can differ across OS line-ending conventions.

`pnpm build` stamps the renderer and both generated native codecs. Ordinary standalone desktop suites and the full workflow runner reject missing/stale stamps, changed outputs, and source edits during execution. Rebuild after source changes, including test or workflow changes. The workflow summary labels targeted runs separately from full desktop coverage. `--print-output` accepts only successful print output for the current source and build. Historical `--baseline` performance captures remain explicitly labeled comparisons; they do not certify the current application and may use an alternate build snapshot.

Screenshot capture first settles the renderer against native content size and zoom, then records its viewport/DPI. It restores that viewport through two animation frames before returning. Failures include expected/observed geometry. Behavior assertions still run once; compositor capture retains its existing bounded retry. Native OS dropdown/accelerator coverage remains subject to the hidden-window limitations documented by the runners; change-event setup is not proof of native keyboard navigation.

## Layers

| Layer | Command | Owns |
| --- | --- | --- |
| Source | `pnpm test` | Geometry, sampling, validation, commands, history, file-session state, preferences, keyboard/label algorithms and subscription contracts. |
| Published contracts | `pnpm test:contracts` | Independent JSON Schema compatibility, published examples, release ordering and publication guards. |
| Native boundaries | `pnpm test:desktop` | IPC trust, filesystem replacement/cancellation, storage corruption/retention, recovery workers and the test harness's own failure/cleanup behavior. |
| Production workflows | `pnpm build`, then `pnpm test:workflows` | Real renderer/preload/main integration, native input and saved/exported output. |
| Packaged startup | `node scripts/packaged-smoke.mjs` | The built native application's startup and recovery-worker paths. |
| Optional WebGL harness | `pnpm test:3d` | GPU lifecycle, retained contexts/buffers, camera invalidation and context-loss recovery; separate from full application security coverage. |

`pnpm test:native` runs native tests against an already-generated codec; `test:desktop` generates it first for standalone use. CI builds once per desktop platform before `test:native`. Source and published-contract tests run once in CI's Linux fast job. That job calls the Windows/macOS/Linux desktop workflow once, so the overall `CI` result still includes every platform. The reusable desktop workflow also supports manual execution.

Release certification deliberately runs the same desktop matrix at the exact requested source SHA. Packaging depends on it, builds the versioned distribution, then checks the actual packaged application. It no longer repeats source tests, native tests and source-tree editor/recovery workflows after certification. The publication script still requires successful CI for the source commit and rechecks issue fulfillment and package checksums.

## Production workflow owners

`node scripts/run-desktop-regressions.mjs --list` lists the maintained suite registry in `scripts/testing/suites.mjs`.

| Suite | Owns | Avoid duplicating |
| --- | --- | --- |
| `smoke` | Sandbox, isolated bridge and recovery-worker round trip | Detailed editing and filesystem cases. |
| `editor` | Native open/save/export, invalid drafts, editing integration, one undoable drag, save races and cancellation | Complete codec matrices or every keyboard traversal. |
| `accessibility` | One field Tab stop, all 500 performers including overlaps, native keyboard workflows, focus, text size/contrast and enlarged UI | Nearest-pointer selection algorithms. |
| `field` | Nearest hit, tie cycling, touch, label modes/collisions, zoom and display scale | Roving Tab-stop tests owned by accessibility. |
| `formation-assignment` | Positional/roster mode, rendered identity paths, travel, rotation continuity, cancel, acceptance/undo and native save/reopen | Shape-handle math and the full file-dialog race matrix owned by editor. |
| `spacing` | Alignment/distribution, unit and anchor choices, lane guides, interval-handle/number agreement, bounds/drafts, orientation/layout, undo and native save/reopen | Full snapping permutations, general nearest-hit and file-dialog race matrices. |
| `coordinate-entry` | Inline drill phrases, explicit side/units, singleton/group preview and Apply, invalid/boundary text, orientation, layouts, named undo and native save/reopen | Parser precision matrices owned by source tests and the full file-dialog race matrix owned by editor. |
| `cast` | Dock/table transitions, row/dot/section selection, filtered/hidden selections, maximum-roster keyboard navigation, name/section edits, removal/undo and dock layouts | Nearest field hit-testing and native file-dialog permutations. |
| `selection` | Additive sections, native lasso and geometric review, scoped invert, saved groups, removal/undo, native save/reopen and narrow/enlarged keyboard paths | Geometric/codec matrices owned by source/contracts; full file-dialog race coverage owned by editor. |
| `workspace` | Panel resizing/collapse, Write/Review/Rehearse, focus escape, narrow/enlarged layouts and layout persistence across native process restarts | Detailed Cast/field selection and file-dialog behavior. |
| `tooltips` | Hover delay, keyboard help, disabled activation, modal layers, keycaps and touch behavior | Basic file/state tests. |
| `tooltips-fallback` | Unavailable WebGL, usable return to 2D, post-fallback help and compositor capture | Repeating the full normal tooltip suite. |
| `preferences` | Choices across desktop restarts, reset/quit and native paper size | Every preference-codec invalid value. |
| `thumbnails` | Committed invalidation, roster/color/selection synchronization | Duplicating history's patch/transaction matrix. |
| `playback` | Real clock, component subscription isolation, static drawing and uncommitted drag previews | Complete interpolation math and unrelated editor forms. |
| `recovery` | Maximum-size project durability and reopening in a fresh desktop process | Filesystem corruption/retention permutations owned by native tests. |
| `print` | Real native PDF handler, long content, all-set coverage and a dense chart | Static HTML-only demo printing. |

Layered overlap is intentional when the failure modes differ: a codec unit test cannot prove IPC rejects an untrusted frame, and mocked native handlers cannot prove packaged worker paths exist. Keep those boundaries. Prefer a small, deterministic fixture for ordinary behavior; use maximum fixtures where scale is part of the assertion.

## Targeted runs and reports

Run a selected owner with `pnpm test:workflows --suite=editor,field`. Unknown or duplicate suite names fail before execution. Each invocation gets a new output directory under `.qa/desktop-matrix/<run-id>`. Its summary records every selected suite's status, duration, exit code and log path. An independent failure does not prevent later suites from running. The latest report pointer is `.qa/desktop-matrix/results.json`; the immutable report remains in that run's directory.

Each launcher uses the same isolated-profile, watchdog, process-tree cleanup and log implementation. Preferences/recovery phases share only their own isolated profile because restart persistence is their contract. A new standalone attempt clears old success reports and writes a fresh `run.json` state. Do not interpret a screenshot or a previous run's report as current success.

Print inspection reads this run's output rather than a shared old `.qa/print` folder:

```sh
python scripts/verify-print.py "$(node scripts/run-desktop-regressions.mjs --print-output)"
```

Install the pinned inspection dependencies from `scripts/print-requirements.txt`. The desktop workflow retains reports, logs, screenshots and PDFs on failure. Actual PDF text/page geometry is checked independently of the renderer. Physical OS chooser interaction, assistive technology, representative school hardware and writer participation retain their separate validation requirements.

## Regression quality

- Name the observable contract and its owner. Add a regression at the lowest layer that can reproduce it; add integration coverage when a boundary is the risk.
- Assert expected identities, geometry, state transitions or independently inspected output. DOM paint order and a second call to the same unchanged serializer are poor oracles for pointer behavior and project immutability.
- Use actual keyboard/pointer input when claiming input coverage. Programmatic focus alone is setup, not a keyboard-navigation test.
- Wait for a named observable state. A hung renderer probe has its own deadline; global suite watchdogs run outside Electron so a blocked app cannot disable them.
- Do not retry failed behavior assertions to make CI green. Only compositor capture has a bounded, logged retry because a hidden window can lack a current surface.
- Keep cancellation, failed saves, stale operations, unsupported versions and untrusted senders covered. Refactoring must not turn failure paths into silent skips.
- Investigate failures before broad reruns. Preserve the failing log and use `--suite=` to verify the repair, then run the full affected layer once.

## Audit baseline — October 14, 2026

The audit covered the 18 source test files, native/contract suites, ten desktop launchers/runners, orchestration and all CI/release entry points. The 213 source tests remain; six harness tests exercise nonzero exits, spawn errors/signals, descendant cleanup, independent failure collection, argument handling and hung renderer probes. Native/harness tests total 40; published-contract tests total 16.

Before refactoring, each PR ran the source suite four times (standalone Linux CI plus three desktop jobs), and Linux repeated almost every GUI workflow. The refactor runs source/contracts once and platform-dependent native/GUI checks once per OS. Release packaging also repeated source/native/editor/recovery checks after its prerequisite matrix; those repeated source checks are removed in favor of packaged-app smoke.

The old `print-qa.mjs` rendered demo HTML separately from the real native print handler and had no maintained callers; the native PDF suite and independent PDF inspection supersede it. The fallback tooltip invocation previously repeated the full normal tooltip run. Field QA repeated the accessibility suite's roving-focus assertion. Both now keep their specific contracts.

CI exposed a stale editor oracle that chose the last painted SVG performer, and later editor setup reused coincident dots while claiming a distinct drag. Tests now assert nearest-center semantics independently and use an unambiguous drag fixture. Keyboard details use real Tab/Home/Page Down input. A v2 validation case now corrupts actual opening timing rather than adding a retired v1 count property. The field print test now checks an immutable project snapshot rather than reserializing the same untouched input twice.
