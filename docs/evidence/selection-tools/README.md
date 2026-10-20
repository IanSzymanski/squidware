# Selection review evidence — #33

Applicable [shared design guidance](../../DESIGN_GUIDANCE.md): sections 1–5. Existing toolbar/Cast entries, Lucide glyphs, shared tooltip/focus behavior and the command registry are reused. Groups are production metadata; ordinary selection and geometric review are transient session state. Existing section colors remain unchanged. Theme switching is owned by #43.

The [before image](before-1366.png) captures the previously built, merged workspace renderer at 1366 × 768, explicitly marked as a baseline comparison. Its field measured 856 × 485 px, with a 48 px header. The new native owner measures 485 px after the added selection controls, above the approximately 470 px target; final screenshots are captured from the changed production build.

After views: [additive sections](selection-sections.png), [saved groups](selection-groups.png), [ambiguous rank preview](selection-rank-preview.png), [freehand lasso preview](selection-lasso-preview.png), [850 px window](selection-850-1.png), and [1000 px window at 200% UI zoom](selection-1000-2.png). Actual renderer viewport sizes are asserted after native resizing/zoom, rather than relying on window requests that Electron could clamp.

The `selection` owner checks real pointer and keyboard activation, review/cancel/apply, scoped inversion and hidden selections, invalid rename drafts, group delete/undo, and exact project/history isolation for selection. A fresh native process opens the saved `.squid` file and recalls the persisted ID group. Source/contract/native tests independently cover group structure, membership and removal behavior. Logs, measured geometry and immutable manifests remain in `.qa/desktop-matrix/`.

Reproduce with `pnpm build`, then `pnpm test:workflows --suite=selection,cast,field,accessibility,workspace`. For the original baseline only, `node scripts/selection-qa.mjs --baseline` captured the retained previous renderer before rebuilding; baseline evidence cannot certify current source.

These are headless native interaction and rendered-layout checks. Automated Windows/macOS/Linux CI is separate from physical multi-monitor/DPI and actual writer/assistive-technology qualification, retained by #64/#3.
