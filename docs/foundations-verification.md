# Foundation batch verification

Work began October 12, 2026 against `79771b6` on Windows. This batch implements the editor-store/command foundation (#4), canonical editor limits (#8), and the selected MIT license/notices (#2), with reproducible local performance tooling and evidence for #3. See [the dependency queue](IMPLEMENTATION_QUEUE.md) for subsequent work.

## Automated and rendered checks

- TypeScript build passes.
- All 108 domain, editor, fixture, and validation regression tests pass.
- All 14 main-process/preload boundary tests pass.
- Vite's production build passes; the dependency notice inventory check passes.
- All 13 production Electron workflow checks pass using the actual main/preload source, controlled native dialogs, real Chromium numeric input events, and a fresh isolated recovery profile per run. They cover boundary import/save (1024 counts, 400 BPM, 64 sections, 10,000-character notes), minimum timing, invalid draft feedback/save blocking/Escape, native undo/redo and selection, invalid cast/formation actions, formation application, playback progression, CSV/SVG exports, and reopening.
- The final rendered editor screenshot was visually inspected. This was a synthetic boundary production, not a drill-writer usability session.
- A targeted independent source review found no remaining concrete defect after fixes for numeric drafts, capacity handling, async command failures, invalid navigation, and saving a newly blurred edit.

## Reproduction

Use the documented Node 24 / pnpm 11.25.0 environment, install the frozen lockfile and Electron runtime, then run:

```sh
pnpm test
pnpm test:desktop
pnpm build
pnpm test:editor
pnpm exec electron . --smoke-test
pnpm dist:win --publish never
```

Local Windows sandbox restrictions required approved child-process execution for esbuild/Vitest/Electron/packaging. The bundled pnpm wrapper also failed to locate some executable shims; the equivalent direct Node entry points were used for local checks. No Electron sandbox or renderer security setting was disabled. The hidden UI check turns off background throttling only in its test window so normal UI updates can settle, and never reads or writes the designer's recovery profile.

## Performance and limits

[The local performance protocol and report](performance.md) separates Node compute, renderer task occupancy, second-animation-frame latency proxies, drag/playback frames, memory, DOM updates and idle 3D activity. Raw reports and traces are generated under `.qa/performance/`; the compact checked-in summary records machine/runtime/build fingerprints. These results describe this development desktop, not a representative school laptop, and animation-frame timing is not a display paint measurement.

A first comparison exposed the cost of revalidating every unchanged set on each edit. The final implementation validates structurally shared immutable edits against a previously validated project, while imports, saving, roster identity changes and field-size changes still receive complete validation. Regression cases compare edit validation with the file validator for invalid timing, geometry, identities, metadata, references, and array limits.

Snapshot history, whole-project JSON equality, synchronous local recovery, thumbnail dependencies, audio-clock behavior and continuous idle 3D remain follow-up work. This batch does not claim the maximum-size 16.7 ms target is met. #3 remains open until its representative-school-laptop criteria are met; #64 requires actual writer sessions and supported-platform acceptance. macOS/Linux runtime workflows and physical audio-device testing were not performed here.

## Packaging and source distribution

The final Windows portable build succeeded in `.qa/foundations-package/`. The packaging hooks verified all three `resources/legal/` files byte-for-byte against their sources, and the packaged executable passed its isolated native smoke test. The staged source-tree tar archive was inspected for the root MIT license, dependency inventory, preserved Feather license, packaging hooks, and redistribution guide. These local artifacts are validation builds, not a published release.

GitHub's default-branch license detection still requires the MIT change to be merged. Issue #2 therefore remains open alongside the draft PR; source-template equality and packaged notices do not substitute for that live check.
