# Workspace layout review — #40

Applicable shared design guidance: sections 1–5. Existing compact chrome, Inspector/Cast controls, typed commands, personal preferences, Lucide icons and tooltip/focus styling are reused. Theme switching remains #43.

At the default 1366 × 768 content viewport, measured field dimensions are:

| Layout | Field width | Field height | Header height |
| --- | --- | --- | --- |
| Before | 868 px | 485 px | 48 px |
| Write | 856 px | 485 px | 48 px |
| Review | 1090 px | 485 px | 48 px |
| Focus | 1342 px | 635 px | Hidden |

Write preserves the approximately 470 px field-height target. Its 12 px width cost provides two visible resize dividers; Review and Focus reclaim substantial field space. No unresolved deviation from the laptop height/header targets is introduced. Small/enlarged windows use wrapping, scrolling and temporary panel overlays rather than replacing saved sizes.

- [Before](workspace-before.png), [Write](workspace-write.png), [Review](workspace-review.png), [Rehearse](workspace-rehearse.png), [Focus](workspace-focus.png).
- [850 × 680](workspace-850-1.png) and [1000 × 700 at 200% UI zoom](workspace-1000-2.png), including a restored overlaid panel. The runner asserts the actual viewport to avoid mistaking Electron's minimum-size clamping for a narrow-window pass.

The `workspace` desktop owner checks real pointer divider resizing/cancellation, keyboard arrows/Home/End/Enter, exact-width sliders, all three presets, restore/reset, focus entry/exit, Escape without losing selection, narrow overlays, preview cancellation before overlay dismissal, and saved widths/panel choice in a fresh native process. Its write phase leaves focus active; its read phase verifies focus starts off. Layout choices, resizing and cancelled previews preserve the exact project/history snapshot.

Source tests cover preference migration and malformed layout recovery, field-space bounds without mutating saved dimensions, guarded drafts, project/history isolation and preference-controller restart persistence. Existing editor, accessibility, field, Cast and preferences desktop suites retain their own behavior contracts.

Reproduce with `pnpm build` followed by `pnpm test:workflows --suite=workspace,editor,accessibility,field,cast,preferences`. Immutable run reports/logs remain under `.qa/desktop-matrix/`; standalone workspace write/read results are under `.qa/workspace/`. The original baseline was captured before rebuilding the modified renderer, using `node scripts/workspace-qa.mjs --baseline`.

These are headless Linux native resize/zoom and process-restart checks. Windows/macOS CI, actual writer/assistive-technology use and physical multi-monitor/DPI hardware qualification remain distinct evidence; #64/#3 retain the human/device work. Screenshots demonstrate the rendered layouts and supplement the interaction assertions.
