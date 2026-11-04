# Dynamic field rendering — issue #12

## Delivered behavior

Playback, fractional scrub, pan/drag, formation/transform/spacing/coordinate previews, adjacent-path review and selection candidates use a Canvas 2D dynamic layer. A separate memoized SVG holds static markings; the existing SVG buttons, handles and guides retain input and keyboard semantics. Paused editing uses the existing vector performer paint. Lost/unavailable contexts and failed draws immediately reveal current SVG geometry; a restored context repaints from the current engine sample.

Both renderers share section/custom/selection colors and collision-aware label placement. Native pointer hit tests still use canonical sampled positions and CSS-pixel radii. One roving field Tab stop, arrow navigation, selection shortcuts, live focused coordinates and readout remain available. Hidden performer paint is memoized during motion; only its transforms and focused description update imperatively. Context allocation is bounded to approximately 16 million backing pixels and DPR 4, without changing world/CSS geometry. Dot sprites are cached by color, selection, radius, backing ratio and theme. There is no renderer-owned animation loop.

Print and SVG export still use `FieldDrawing` without screen presentation. Neither includes a canvas or raster image. Native PDF and vector regression checks cover that path.

## Profiling decision and results

The before build is the production content at `e0ea403` (PR #171), identical to merged main `47b86c9`. It contains the completed #11 subscription/static-field isolation. The archived baseline and profiles confirmed remaining performer reconciliation/label layout work. The first canvas attempt also exposed repaint cost from embedding a canvas in SVG: the final dynamic surface is an independent HTML canvas, with cached dot artwork.

CPU sampling additionally identified whole-show problem-marker scans during worker replies. A bounded weak cache now retains each immutable move's bounds and one marker viewport, avoiding repeated scans of off-screen findings while preserving counts, severity and first-finding identity.

[performance.json](performance.json) records host/runtime/build/source identities, all 16 workloads per build, cadence median/p95, second-rAF latency median/p95 and average CDP main-thread work. Raw reports, logs and the maximum playback CPU profiles remain in `.qa/field-renderer/{baseline-1366,optimized}`.

Maximum fixture (500 performers, 128 sets), milliseconds:

| Metric | SVG before | Canvas after |
| --- | ---: | ---: |
| Average renderer work per rAF opportunity, playback | 24.90 | 15.86 |
| Playback cadence, median / p95 | 33.20 / 33.50 | 16.70 / 16.80 |
| Average renderer work per opportunity, drag | 6.17 | 4.91 |
| Drag cadence, median / p95 | 16.70 / 16.70 | 16.70 / 16.70 |
| Average renderer work per opportunity, fractional scrub | 11.00 | 7.86 |
| Average renderer work per opportunity, resize | 39.76 | 22.01 |
| 4× CPU playback average work / cadence p95 | 87.53 / 100.10 | 65.99 / 83.30 |
| 4× CPU drag average work / cadence p95 | 25.14 / 83.30 | 17.76 / 50.10 |

The default-host maximum playback/drag averages and cadence meet the 16.7ms investigation target. This is one software-host comparison; average work is **not** a per-frame CPU p95. CPU-throttled playback and resize remain above the target, and resize has a 50ms cadence p95 even without throttling. These limits remain visible; the stress scenario is not a 60Hz guarantee or a physical-device qualification. Profiling includes worker replies, native renderer scheduling and instrumentation overhead. The two-rAF proxy spans two frame opportunities and is not interpreted as one frame's CPU work.

Reproduce sequentially on an otherwise idle host, preserving `dist` before editing:

```sh
pnpm build
# Preserve this build before changing implementation:
cp -a dist .qa/field-renderer/before-build
# After changes/build, compare the preserved build and current renderer:
node scripts/field-renderer-qa.mjs --baseline --build=.qa/field-renderer/before-build --output=.qa/field-renderer/before
node scripts/field-renderer-qa.mjs --profile --output=.qa/field-renderer/after
# Correctness only (also registered in the normal native matrix):
node scripts/field-renderer-qa.mjs
```

Use `xvfb-run --auto-servernum` on a headless Linux host. Chromium's sandbox and context isolation remain enabled. The fixture generator is deterministic; the report retains the full fixture inputs. Each workload has 48 observations, 250ms settling, and eight scrub warmups; CDP CPU rates are 1 and 4. Viewport is 1366×768. All performers are selected for timed workloads. The native drag probe verifies a real preview before accepting its measurement.

## Functional and design review

Applies [design guidance](../../DESIGN_GUIDANCE.md) §§1–5. Existing field colors, typography, presentation preferences, commands, geometry, readout, tool controls and accessible SVG buttons are reused. Agent visual review covers dark/light/high contrast, default laptop size, 125% UI scale at 1000×700, dense 500-person paths and selection candidates. Default field-container height remains **485px**, above the approximately 470px target. No new controls or save format are introduced.

The native `field-renderer` suite checks all performer transforms against engine samples and samples actual canvas pixels at DPR 1/2, both orientations and zoom 0.6/1/3. It verifies retained buttons, one field Tab stop, native arrows/Enter, live focused coordinates, automatic vector fallback/recovery after unavailable/lost contexts and injected draw failure, representative canvas/SVG pixel comparison, neighboring paths/arrowheads, selection candidates, native full-roster drag, Escape cancellation, single-transaction release and Undo. View/theme changes preserve project revision and coordinates. Source checks cover shared label rectangles, colors, bounded allocation, unchanged vector export and marker-cache boundaries/invalidation.

Screenshots are supporting evidence; native interaction and source checks establish behavior. The existing print, field, accessibility, selection, playback, movement, preview and theme suites supply additional regression coverage. Local check totals and the final build/native results are recorded in the PR.

Reviewed screenshots: [SVG baseline](before.png), [canvas playback](after.png), [maximum paths](maximum-paths.png), [light theme](light.png), [high contrast at 125% and 1000×700](narrow-125.png). Native pixel comparisons also capture the current SVG fallback at the same count/selection.


## CI regression corrections

The first cross-platform run exposed duplicate selection-set construction in canvas painting and an array scan in the focused SVG description. Both now reuse the editor's immutable selection-membership cache. The unchanged native thumbnail guard requires exactly one cache construction for a new section selection and zero constructions/scans during playback; its failure reproduced locally before the correction.

The canvas layout check now asserts the same 1366×768, 100% renderer viewport even when the native desktop window is constrained. The test deliberately retains its narrow native window while applying that viewport, so all platforms exercise the macOS work-area limitation without reducing the 470px field-height target. Native panning supplies Electron's held-left-button modifier and verifies canonical view-matrix movement plus an opaque canvas dot at the new location, rather than relying on bounds of transparent SVG paint. These are internal performance/test corrections; section colors, physical geometry, print/export and visible styling are unchanged.
