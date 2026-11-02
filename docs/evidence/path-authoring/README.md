# Individual path authoring review

Reviewed on a Linux x64 software host with Node 24.19.0, Electron 44.7.0,
Xvfb and software rendering. No human, physical-device, macOS or Windows pass is
claimed. Hosted platform/package certification remains CI's responsibility.

The baseline screenshots use the main #163 build before this change. The after
screenshots and `results.json` come from the final successful combined desktop
run recorded in `related-workflows.json`. That run tested all implementation
files at content hash `3fd8e4fe51c2145f0d51167eddc2b84dcaea4d47da94d9af00af2bca79a4c56b`,
before these evidence-only copies and this review record were added.

All six selected workflows passed together: authoring, existing path editing,
movement schedules, path operations, field presentation/selection and startup.
The authoring checks include native drag and Escape rollback, pointer/numeric
equivalence, keyboard nudge, freehand reversal and endpoint rejection, hold and
fractional count ticks, atomic undo/redo, native save/reopen, 1×/2× capture and
display scale/themes. Existing path checks also exercise curved CSV/PDF output.

Design guidance §§1–4 applies. The existing Modal, HelpButton/Tooltip, neutral
theme styles, FieldDrawing, movement sampler, snapping and command validation
are reused. Main field height remains 485 px at 1366×768, above the 470 px target.
The editor keeps its Apply/Cancel footer visible; its interior scrolls at 150%
UI scale and 1024×768. Enlarged content requires scrolling between field and
numeric rows, with every required action verified reachable. Advanced fitting
text is collapsed to preserve field access. The field remains one Tab stop;
numeric coordinates and the count table supply alternatives to dense handles and
overlapping tick text. Set endpoints use squares/text and selection uses a ring.

Rendered inspection covered dark handles and the fitted S-route, the 4× field
zoom, attachment errors, light and high-contrast fields, and enlarged dark
controls/field. The field retains its dark production surface in every UI theme.
Handle labels retain readable screen size; held tick labels combine into count
ranges while the table preserves all individual samples. Pointer handling is
confined to the explicit modal field; ordinary dot selection passed its existing
desktop workflow.

`fitting-performance.json` records 100 measured runs after 10 warm-ups, each
fitting 2,048 points to 16 intervals at 0.15 yd tolerance: median 0.817 ms,
p95 5.238 ms, maximum 29.582 ms on this host. The deterministic input is
`x = 10 + 80*i/2047`, `y = 25 + 8*sin(2*pi*i/2047) + .002*sin(13*i)`.
This measures fitting compute only. Native 2/64/500-performer open/edit timings,
including two renderer frames, are retained in `results.json`; they are local
observations, not hardware qualification or delivery budgets.

The chosen fitter produces lines or collinear cubic chords rather than claiming
automatic smooth-curve fitting. Manual refinement and existing timing controls
remain explicit. The first slice leaves shared-route persistence, closure/seams
and conveyor use open under #75/#50; this evidence does not close expanded #75.
