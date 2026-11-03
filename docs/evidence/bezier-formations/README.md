# Bézier formation review — 2026-11-03

Implements #98 using the shared route evaluator and the existing live-formation model. Geometry and controls are separate from travel paths and group movement (#50). The remaining #75 conveyor integration does not change this formation editor.

## Validation

- 770 source tests pass, including independent dense polynomial integration for uneven-curvature spacing, exact de Casteljau subdivision, tangent modes/zero handles, malformed/degenerate data, 2/64/500-member Apply and file round trips, membership detachment, redistribution, copy, pending/stale/empty selection, cancel and undo.
- All 88 native tests pass. The v9 native test opens/saves the portable example and proves malformed anchor IDs cannot overwrite the saved production. The command sandbox suppressed child stdout in a harness check; running the suite outside that command sandbox passed with no application change.
- Format contracts and production build pass. V9 has a portable schema and example; old wire versions reject Bézier metadata, and clearing audio anchors omits the empty optional list.
- The final Linux Electron `bezier-formations` regression passes. Native events cover tangent drag, Escape gesture rollback, pointer/numeric equivalence, anchor selection, split/symmetric joins, deletion/minimum anchors, one-step Apply/undo/redo, keyboard Edit, native v9 save/reopen, boundary rejection with numeric reset, reversed orientation and zoom. Unrelated dots and serialized move paths retain their values.
- The existing `live-formations` desktop regression passes in the related run, covering ordinary shape editing, copy conflicts, detached members, redistribution, native v7 files, themes and layout. Reports retain build/source identities and their local-host limits.

## Rendered and interaction review

[Design guidance](../../DESIGN_GUIDANCE.md) §§1–5 apply. The implementation reuses HelpButton/tooltips, NumberField, command dispatch, fixed formation Apply/Cancel controls, live membership/copy behavior, production snapping and the field's coordinate transform. No new global theme or layout rules are introduced. Anchors are square; tangents are round with control lines; join modes and unavailable actions have text alternatives. The field remains one Tab stop, with anchor/tangent selectors and numeric entry in the Inspector providing keyboard access.

Before/after: `bezier-before.png`, `bezier-wave-preview.png`, `bezier-edited.png`, `bezier-applied.png`. `bezier-boundary-rejected.png` shows rejection without moving the saved geometry or retaining an invalid numeric display. The field handles and controls were inspected in dark, light, high-contrast and enlarged narrow-window captures. The light capture retains the app's temporary file-open notification; it does not cover the editor controls.

At 1366×768/default scale, measured field height is **485 px** in all three themes, exceeding the approximate 470 px target. At 1120 px/125% scale the inherited wrapped chrome and enlarged panels reduce the field to **296.25 px**; Apply/Cancel remain fixed and visible, while anchor/numeric/split/delete controls remain reachable by Inspector scrolling. Panel collapse, zoom and numeric entry remain available. The default-scale target is not claimed for this enlarged narrow layout. Saved coordinates and file status remain independent of these personal presentation preferences.

## Geometry, editing and performance limits

Slots include endpoints and follow adaptive arc-length sampling with .001 yd total length budget and .0005 yd local parameter bound. Independent 10,000-step-per-cubic integration fixtures bound sampled-point deviation to .006 yd, including the reference grid resolution; split/re-sample comparisons remain within .002 yd. Controls must stay inside the field; segments must contain at least .01 yd of travel. Up to 33 anchors and 500 slots are supported. Split preserves the locus; deletion explicitly reconnects remaining controls and changes the reviewed shape. Changing to a constrained join uses the outgoing tangent as the direction source; later handle edits enforce the chosen rule.

`benchmark.json` records 100 runs after five warmups on this Linux/Node 24 software host, for a two-set production and a single-cubic S-curve. Full preview p95: **2 members 2.35 ms; 64 members 0.81 ms; 500 members 2.16 ms**. Geometry-only p95 is below .31 ms in these fixtures. These are local measurements of the sampled fixture, not cross-platform or physical-hardware guarantees. Multi-segment sampling remains subject to the shared bounded subdivision budget.

Equal along-curve intervals do not guarantee physical separation. Self-crossing forms remain valid editable geometry; existing travel/spacing analysis retains its role. Cross-platform CI and package certification remain separate from these local Linux runs. Human signoff and physical hardware qualification are not gates under the validation policy.
