# Rehearsal passage review evidence

Before: main `3d2e04c`, using the same deterministic two-performer, three-set fixture. After: #86's implementation on the same Linux software host. Agent review covers the compact default workspace, saved range editor, focused field, missing-target repair warning, dark/light/high-contrast and the 1024×720 window at 150% scale. Native entry/navigation, draft cancellation, saved metadata, audio/silent loops and export behavior are exercised by the registered suite.

- [Before workspace](rehearsal-before.png) / [After workspace](rehearsal-default-dark.png).
- [Range editor](rehearsal-range-dark.png) / [Focused rehearsal](rehearsal-focus-dark.png).
- [Missing target](rehearsal-missing-target.png), [Light](rehearsal-range-light.png), [High contrast](rehearsal-range-high-contrast.png), [Enlarged](rehearsal-enlarged.png).
- [Checks and measured viewports](results.json). Native PDF text inspection confirms the saved name, move-local target, absolute count range, focus and annotation.

The default layout retains 485 px field height at 1366×768. The active passage strip uses 35 px in the reviewed fixture, leaving a 450 px field only while a passage is active; it makes scope and an exit action visible. The dialog and bounded annotation strip scroll, including enlarged layouts. Colors use the existing theme tokens; selected passages use an outline and repair states include explicit text. Screenshots are captured at the top of the dialog, with lower actions verified through native focus/scrolling.

These are targeted production Electron checks on an Xorg dummy display with local `--no-sandbox --disable-dev-shm-usage` flags. The flags are not committed into launchers or shipped configuration. Results retain their tested source identity; copying evidence and documenting it occur afterward. They do not certify other platforms, sandbox behavior, packaged builds or hardware. The normal cross-platform suite runs through the unchanged certification launcher.

CI follow-up: the first macOS run passed 23 of 24 suites but failed the new rehearsal suite's initial viewport assertion (1366×768 requested, 1366×647 observed) before any rehearsal behavior checks. The production `ready-to-show` handler had automatically exposed the window to native desktop work-area constraints. The suite now defers `BrowserWindow.show` through the fixed-size capture, following the existing set-creation setup, then restores native showing and settles the visible viewport for every interaction check. The original 1366×768 and ≥470 px field assertions remain unchanged. Capturing before asserting also records the failed viewport for diagnostics.

A [local visible-window height constraint](ci-viewport.json) reproduces the old exact 647 px failure. The corrected complete workflow passes under the same constraint: hidden layout capture measures 485 px field height at 1366×768, while native input, range/audio loops, save/reopen, PDF, repair warnings and enlarged access run in the constrained visible window. This is test setup evidence; product code and layout are unchanged, and hosted certification must verify the fixed revision.
