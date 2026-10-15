# Desktop and print regression coverage (#69)

`Desktop regression` runs the same production-build cases on Windows, macOS and Linux, called once by CI for pull requests/main pushes and available for manual runs. It is also a required reusable job before release packaging, checked out at the release coordinator's exact source SHA. A failed platform prevents release packaging/publication. None of these jobs creates tags or publishes releases. [TESTING.md](TESTING.md) defines coverage ownership, commands and report semantics.

Each platform installs the locked application toolchain and pinned PDF inspection tools, then runs the production build, native boundary tests and these desktop cases. Source and published-contract tests run once in CI's preceding fast job:

| Suite | Evidence |
| --- | --- |
| Native smoke | Sandboxed renderer, isolated bridge and recovery-worker round trip. |
| Editor | Create/edit/save/reopen, native file handlers with injected cancel/error results, invalid/pending drafts, multi-frame drag, undo/redo, playback, preview locks, CSV/SVG exports. |
| Accessibility | Keyboard entry/exit, reachability of all 500 performers including overlaps, selection/nudge distinctions, focus visibility, keyboard save/export, text sizes at 125% UI zoom. |
| Tooltip | Pointer/focus, disabled explanations and activation guards, native platform shortcut labels, modal layers, explicit unavailable-WebGL pass. |
| Preferences | Multiple desktop launches, saved choices, reset, pending quit and A4/Letter PDF dimensions. |
| Thumbnails | Maximum-size invalidation counts, roster/colors/selection, undo/redo and playback. |
| Playback | 500-performer committed-render counts, static-field invalidation, actual clock advancement and pointer-preview/history isolation. |
| Recovery | Maximum 500-performer/128-set production restored and explicitly saved after process restart; stale/interrupted/unavailable storage cases. |
| Print | Actual native PDF handler; 128-picture charts with a 10,000-character note, 128-set performer tables and a 500-performer chart. |
| Packaged app | Unpacked production package starts its sandboxed renderer and performs the recovery-worker round trip from packaged paths. |

Run `pnpm build`, then `pnpm test:workflows`. Pass `--suite=editor,field` for a targeted run. Inspect the current PDF output with `python scripts/verify-print.py "$(node scripts/run-desktop-regressions.mjs --print-output)"`. On Linux use Xvfb with the installed Chromium sandbox helper configured as in the workflow. `pnpm test:print` runs only print generation. Install the inspection dependencies with `python -m pip install -r scripts/print-requirements.txt`. `pnpm exec electron-builder --dir --publish never` and `node scripts/packaged-smoke.mjs` reproduce packaged startup.

## PDF fixtures and assertions

The print fixture generator starts from the deterministic maximum production, keeps two performers for the 128-picture/table cases, and retains 500 performers for the dense chart. It includes a long unbroken production title, a 10,000-character multiline note with long unbroken text and begin/end sentinels, every picture number/name and known coordinate rows. Every fixture passes the real project serializer before printing. These are validation data, unsuitable for rehearsal.

Chromium emits three PDFs through the real sender-checked desktop handler: Letter landscape field charts, A4 landscape performer coordinates and an A4 dense field chart. Pinned independent PDF tools require the expected paper dimensions, all 128 picture and note markers, 256 coordinate rows, complete long text and every visible character box inside the page. Pagination may vary slightly with fonts/Chromium, so snapshots compare semantic content and geometry rather than nondeterministic PDF bytes. Linux retains raster previews of chart/table/monochrome pages. Local visual inspection also covers long-note continuation and final pages.

The checks exposed clipped long titles, unwrapped rehearsal notes and dark page margins inherited from the desktop window. Print CSS now wraps long title/set/table text, preserves note line breaks, allows notes to paginate, retains charts as unbroken SVG blocks, wraps metadata and explicitly paints white page backgrounds. The independent PDF inspection also verifies the final full-page background. This preserves existing packet templates; #35 owns later rehearsal layout features.

## Reports and bounded acceptance

Artifacts named `desktop-regression-<OS>` retain test reports, logs, PDF verification, generated PDFs and screenshots even after failure. The print report records OS/architecture/CPU/memory, Electron version, GPU feature/device inventory, actual fixture sizes/counts and exact source/build fingerprints. Editor/accessibility reports expose their individual checks rather than hiding them behind a single success flag. All app profiles, files and injected dialog results are isolated from user productions.

Local Windows PDF verification passed 130 chart pages (62,593 character boxes), 16 coordinate pages (19,208 boxes) and one dense page (4,054 boxes), with complete text and correct page geometry. These numbers are fixture-specific, not universal pagination guarantees. Hosted matrix artifacts supply the corresponding supported-platform evidence; inspect all three job results before closing #69.

The native dialog results in automated error/cancel cases are test doubles around real handlers. Physical OS chooser interaction, screen-reader certification, actual writer participation, school-laptop qualification and signing remain #64, #3 and #72 as specified by their own acceptance criteria. Automated platform success does not fulfill those separate requirements. Dense-label redesign remains #20; grayscale snapshots exercise the current print template without claiming a new monochrome preference.

Hidden macOS windows cannot receive Cocoa app-menu accelerators as a visible key window would. The note-entry check dispatches the same native Select All menu entry and verifies the full text selection before typing; other field navigation and activation use native key events. The roster-focus check waits for each expected performer rather than assuming a fixed five-millisecond render time. Graphics inventory refusal is recorded explicitly alongside GPU feature status; unavailable metadata cannot erase otherwise completed workflow evidence. The macOS matrix also exposed keyboard tooltips being dismissed by automatic panel scrolling; focused help now follows its control while hover help retains scroll dismissal.

Keyboard Tab traversal is bounded by the rendered control count, including the maximum Cast's 1,500 row controls. A fixed 700-step limit could falsely report unreachable navigation after native workspace activation reset the focus origin. The editor hover check asserts the intended exact-center performer and stable ties, independently of SVG stacking order; the movement-history check uses a distinct center while the field suite owns coincident-dot cycling. Existing focused-performer checks also cover a stationary pointer followed by programmatic focus, overlapping performers, boundaries and window resizing.

Tooltip dismissal waits for the rendered tooltip to disappear with the harness's finite timeout. A fixed 150 ms sleep raced the 100 ms dismissal timer and React commit on hosted macOS, despite the pointer-leave event arriving correctly. Hover-delay, keyboard, disabled-control and forced unavailable-3D assertions remain in the same suite.
