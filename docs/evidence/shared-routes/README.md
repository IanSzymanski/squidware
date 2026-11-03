# Shared-route software evidence

2026-11-03, Linux x64 / Node 24.19.0 / Electron 44.7.0 under Xvfb, software
rendering. Fixtures are the public three-picture/two-performer example plus
synthetic 2/64/500-member casts. This is software-host evidence, without human
or physical-hardware qualification (see [validation policy](../../VALIDATION_POLICY.md)).

## Checks and identities

- 760 source tests passed, including 16 route tests: independent dense Bernstein
  integration, distance/length error, forward/reverse locus, negative/positive
  closed wrapping, exact splitting, anchor/control translation, bounded fitting,
  invalid geometry, guards, undo/deletion and renderer/native codec agreement.
- Format/release contract checks passed, including the regenerated v1–v8 schemas,
  v8 example, coexistence with live formations, minimum required writer version,
  old-wire protection and unsupported-future-version errors.
- All 86 native bridge/harness tests passed outside the command sandbox. Inside
  that sandbox, a child stdout fixture produced an empty captured log; the same
  unchanged harness passed under the normal execution permissions used for the
  desktop workflows. No harness behavior was relaxed.
- [Related desktop matrix](related-desktop.json): shared-routes, path-authoring
  and paths all passed at Linux concurrency 2 on source content hash
  `0f7f5673faa2c439eefa2c4fd7e8a39c8b5e3aca04a577969e0a88b224bfca45`.
- Render review then moved route errors into the fixed footer and made disabled
  route buttons visibly distinct. The [final route replay](final-desktop.json)
  passed on content hash
  `0c26ed15e6ff92d8d611cee1217b9be1b4c65e449fee44d67dd1b5cb5cdf42ae`.
  [Native results](results.json) and [run identity](run.json) retain their precise
  source/build and runtime provenance. These reports precede this evidence-only
  documentation addition; they do not claim a later source hash was tested.

The native suite captures a freehand S, fits it, verifies one undo, saves and
reopens v8 through real native file menus. It checks keyboard anchor movement,
pointer cubic control movement, Escape rollback, numeric cancel/apply and explicit
reverse. It builds a closed anchor polygon, splits and reverses it, edits the seam
and verifies exact closing equality without changing any performer positions or
move data. Duplicate names block Apply. Confirmed deletion and undo restore the
saved route identities. The 2/64/500 previews retain route geometry independently
of cast size.

## Rendered and interaction review

[Design guidance](../../DESIGN_GUIDANCE.md) §§1–4 applies. The implementation
reuses Inspector/Commands, the shared modal and HelpButton, field drawing and
handles, numeric controls and theme tokens. Apply/Cancel stays in a fixed footer;
the parameter area scrolls. The normal 1366×768 field retains **485 px** height,
above the 470 px target. The modal's separate preview is **300 px** high to leave
room for handles and controls. At 900×768 and 125% scale, the underlying field
contracts to 303.75 px; the modal preview is 375 px and both footer actions stay
visible. The narrow-window deviation is explicit and does not strand controls.

- [Workspace before opening a route draft](routes-before.png): no cast selection;
  existing field and navigation remain accessible. This includes the new entry
  button, rather than claiming to be an image of the unmodified main branch.
- [Fitted S draft](route-fitted-stroke.png): numeric/field preview before Apply.
- [Closed seam inputs](route-closed-seam.png): explicit closure and translated
  seam coordinates. Native assertions verify the geometry in the saved file.
- [Dark](route-dark-1366-1.png), [light](route-light-1366-1.png) and
  [high contrast](route-high-contrast-1366-1.png): agent-reviewed field/handle
  contrast and fixed actions. Dense first-segment labels can overlap at 1×;
  segment selection, bracket navigation, exact numeric controls and existing
  2×/4× field zoom provide disambiguation without changing physical geometry.
- [Enlarged narrow layout](route-dark-900-1.25.png): scrollable content and
  reachable actions, without horizontal clipping.
- [Invalid duplicate name](route-invalid-name.png): visible textual footer error,
  disabled Apply and an available Cancel. Earlier review found the error could
  scroll out of view; the final replay verifies the corrected footer.

An initial pointer test hit an overlapping neighboring control on the dense
first fitted segment. The final test moves the numeric control apart before
testing native pointer drag; keyboard selection is checked independently.
No failed path was replaced with direct production-state mutation.

## Measured scope

[Fit benchmark](fit-benchmark.json): 2,048 captured S-stroke points fit to 18
segments and compile a distance table in **0.93 ms median / 4.19 ms p95** across
100 measured runs after five warmups (maximum 17.01 ms). This is one software
host, not a representative-hardware qualification.

Final hidden Electron preview readiness, including two compositor frames, was
**2029.2 / 36.2 / 207.7 ms** for 2/64/500 performers respectively. The first cold
preview was slower; this is retained rather than represented as warm interaction
latency. The native 41-event capture-and-fit orchestration took 42.8 seconds,
including debugger round trips, input/scroll readiness and native capture; use
the separate fit benchmark for algorithm cost. No universal responsiveness claim
or physical clearance result follows from these measurements.

## Remaining scope

Related to #75 and #50. #75 stays open for routes consumed by conveyor/group
movement with explicit member order, offsets/delays, count ticks and movement
analysis. The delivered library stores geometry only. This PR does not mark
cross-platform hosted CI or all desktop owners as passed; those run separately.

## Source certification follow-up

[PR #166's first CI run](https://github.com/IanSzymanski/squidware/actions/runs/41668858589)
failed because the source route test imported the generated
`electron/project-codec.cjs` before the desktop build stage. A prior local build
had hidden that dependency. The source test now checks renderer round trips
without native artifacts; codec assertions live with the existing native bridge
tests, after their codec build. The native v8 test also verifies real file
save/open and that invalid closure cannot overwrite the durable file.

Verification: all 760 source tests and format/release contracts passed while the
generated project codec was temporarily absent; type checking passed. After
building the codec, all 87 native tests passed. Application behavior and CI stage
ordering are unchanged. These local results do not claim the subsequent hosted
run has passed.
