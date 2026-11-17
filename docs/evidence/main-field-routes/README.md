# Shared routes on the main field

2026-11-17, Linux x64 / Node 24.19.0 / Electron 44.7.0 under Xvfb with software rendering. This is local software-host evidence; it does not claim new Windows/macOS, packaging or physical-device results. See the [validation policy](../../VALIDATION_POLICY.md).

## Change and design review

This is the Shared routes increment of #179, following the [path/timing port](../main-field-paths/README.md). Route geometry, editable handles, captured strokes and distance ticks now use the actual field's existing zoom, pan and orientation. Parameters borrow the Inspector, with Apply/Cancel pinned above the scrolling form. The modal and inset field are removed. Move operations and the separate simple cubic dialog keep their existing presentation.

[Design guidance](../../DESIGN_GUIDANCE.md) §§1–4 applies. Reuse the main-field `TravelOverlay`, Inspector layout and temporary preview demand, HelpButton with pass-through help, formatted numeric inputs, shared theme styles and `routes.open`/`routes.save`. Route fitting, validation messages, serialization, sampling and named undo commands retain the existing implementations. No physical coordinates or production data are changed by presentation preferences.

The previous [modal S draft](../shared-routes/route-fitted-stroke.png) and [modal layout](../shared-routes/route-dark-1366-1.png) are historical before views. The after [S draft](route-fitted-stroke.png), [closed seam](route-closed-seam.png), [duplicate-name error](route-invalid-name.png), [dark](route-dark-1366-1.png), [light](route-light-1366-1.png), [high contrast](route-high-contrast-1366-1.png), [125% narrow window](route-dark-900-1.25.png), [150% enlarged window](route-dark-1024-1.5.png) and [flipped/panned field](route-flipped-panned.png) record the port. Rendered review covers the themes, fitting, seam, error, enlarged and flipped states; the invalid route is hidden while its validation error is shown, as in the earlier editor. Apply remains disabled until the draft is valid and capture is finished.

At 1366 × 768 / 100%, the field measures **513 px high**, exceeding the approximately 470 px target. At 900 × 768 / 125%, it measures 480.75 physical px. At 1024 × 768 / 150%, it measures 423.5 physical px: the effective viewport is about 683 × 512, so reduced field height is expected. Both pinned actions and the field remain visible, with the form independently scrollable. This constrained-window deviation does not strand controls and is not substituted for the default-scale target.

## Interaction and geometry evidence

The native route suite verifies:

- Freehand S capture against the canonical existing fitter, comparing 101 distance samples within 0.35 yd including native input quantization. Numeric closed anchors, exact splitting, seam translation and reversal retain the same results. Remove and curve/line controls retain their prior handlers.
- Pointer handles and keyboard arrows, drag Escape rollback, numeric cancel/apply, one named undo/redo and native v8 save/reopen. Saved route IDs, seam closure and geometry survive; performer positions and move data stay unchanged.
- A complete route creation using native Tab, Space and text input: name the route, place three numeric anchors, Fit, Apply and undo. There is no pointer input during that task.
- No modal or inset SVG, initial focus on Cancel, unchanged main-field zoom, native middle-button pan and flipped arrow directions. The ordinary performer readout is suppressed while route geometry is on the field.
- Unrelated edits and history are locked even for an untouched existing route. Timeline seeking, set selection and playback discard the unapplied draft. A collapsed Inspector and focus mode are temporarily exposed without changing the stored layout, and restored after closing.
- Unique-name errors, disabled Apply, route deletion confirmation, all three themes and narrow/enlarged layouts. Geometry compilation remains cached while only capture, pan or presentation changes.

[Route results](results.json) retain the individual assertions and viewport rectangles. Preview readiness, including two animation frames, measured **43.5 / 32.1 / 72.4 ms** for 2 / 64 / 500 performers. Native 41-point capture and fit took about 787 ms including automation overhead. These are local observations, not hardware guarantees.

## Validation and provenance

The production build, 1,042 source tests, 35 contract checks, 101 native checks and six desktop suites passed: shared-routes, path-authoring, movement-schedule, path-operations, field and workspaces. The [six-suite matrix](related-workflows.json) records content hash `7a72a0bf459623667d49d62004a0b7dd72ddb12742212a65e6a13ab11adb151d`.

After retaining cached route compilation and adding the full keyboard task plus 150% layout, the production build, 22 focused route/command tests and [final route replay](final-workflows.json) passed. The [run identity](run.json) records final desktop content hash `6eb468119dfd54a3f189e605cc77a472a677d0aef8e7c3b50dc8774b624319b2`. These hashes precede the evidence and guide additions. The recorded matrices certify their own source identities, not a later commit. CI is left unpolled.
