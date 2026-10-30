# Curved performer paths — software review

Issue [#73](https://github.com/IanSzymanski/squidware/issues/73). This evidence covers one full-move cubic Bézier path per performer, numeric editing, shared sampling and compatibility. Multiple submoves, field handles, advanced path operations and curved analysis remain separately owned.

## Results

- Source certification: **674 source tests and 27 format/release checks passed**. Analytic line/cubic fixtures, coincident points, loops, exact boundaries, easing, stable IDs, v5 round-trip, old-format/future-format refusal, invalid controls, stale transactions, atomic undo and maximum-size sampling are included.
- **81 native checks passed**, including actual native handlers reading/writing v5 geometry and rejecting a malformed control without changing the saved file.
- [Final desktop report](final-workflows.json): **paths, smoke and print passed**. The paths suite uses native mouse input, dropdown typeahead, numeric typing and Enter/Escape, with real renderer/preload/file IO. It verifies explicit selection, known midpoint `(20,26.25)`, invalid input, cancellation, one undo/redo, scrubbed field geometry, exact vector overlays, native v5 save/reopen, native CSV/PDF export, three themes and reachable keyboard Apply at enlarged scale. It collects renderer errors/unhandled promises; the collection was empty.
- [Related desktop report](related-workflows.json): **editor, split-transition and analysis passed** on the preceding source. That report also retains the initial paths harness failure: the screenshot helper deliberately blurred focus before an Enter-key assertion. The final suite restores focus after capture and passes without weakening the keyboard assertion. The later app change uses existing field-specific colors for readable light-theme path/control overlays.
- [Independent export inspection](export-inspection.json): all six CSV rows and two PDF pages inspected, with curved travel distance, unavailable peak field, expected descriptions and all extracted word boxes inside page bounds. [PDF](curved.pdf) was also rasterized and visually reviewed. [Existing print regression inspection](print-inspection.txt) passed all paper/layout fixtures.
- [Sampler microbenchmark](sampling-performance.json): 2,000 measured frames after 200 warmups, 500 performers and 128 sets with every move cubic, mean **0.290 ms**, p95 **0.447 ms**. This is an engine-only in-memory measurement; an all-curved maximum file can exceed the existing 10 MiB wire budget. It is not a UI/render or device qualification result.

## Rendered and interaction review

Design guidance sections 1–5 apply. Existing Modal, FieldDrawing, tooltips, command registry/history and theme tokens are reused. [Before](paths-before.png), [preview](paths-preview.png), [invalid](paths-invalid.png) and [applied](paths-applied.png) were captured at **1366×768**. The normal field remains **485 px** high, above the approximate 470 px target; this dialog adds no permanent field row. Existing Inspector content scrolls vertically.

[Dark](paths-dark.png), [light](paths-light.png) and [high contrast](paths-high-contrast.png) show the same geometry. Field overlays use the existing constant-dark field palette; interface colors remain theme-aware. Dashed/solid paths, numbered controls and selection rings explain states without color alone. Text and controls were visually reviewed. The SVG is a named image with an accompanying sampled-position status; control inputs have labels and shared focus/hover help.

[1024×720 at 150% browser scale](paths-enlarged.png) has a **683×480 CSS viewport**. The dialog is **456 CSS px** high. Its body scrolls; the footer stays visible and keyboard Apply completes the edit. The underlying field is **181.667 CSS px** in this constrained viewport, below the default-size target; it is covered by the modal during review. Enlarged field authoring retains the existing workspace behavior. No default-size field-height regression was introduced.

## Scope and host limits

Full-move cubics use parameter timing, so their speed may vary. Both reference and worker analysis explicitly report unsupported curved spacing/stride checks, and coordinate output leaves peak step size unavailable. Split and predecessor-changing set operations reject surviving curves atomically. These responses are intentional boundaries for #74–#77, not passing analysis or advanced editing claims. The viewer feature has not landed; its eventual geometry consumer must use the shared sampler.

Host: Linux x64, Node 24.19.0, pnpm 11.25.0, Electron 44.7.0, software rendering/Xvfb. Native file chooser destinations are controlled by the harness. Electron and subprocess-dependent native tests run outside the command filesystem sandbox with Chromium sandboxing retained. An initial sandboxed harness run could not capture child stdout; all 81 native checks passed outside that sandbox. D-Bus diagnostics and print-font metadata notices were nonfatal. No physical-device, subjective-listening, human-signoff or hosted cross-platform CI claim is made.

Reports retain the precise tested source hashes, preceding this evidence copy and later documentation-only packaging records. Hosted CI must certify the pushed commit separately.
