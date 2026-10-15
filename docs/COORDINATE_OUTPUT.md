# Rehearsal coordinates and incoming moves

Issue [#34](https://github.com/IanSzymanski/squidware/issues/34) adds whole-, half- and quarter-step coordinate output and incoming movement details on performer sheets. Quarter steps are the default for new preferences. Existing decimal-only preferences retain their decimal setting until a step increment is chosen. These are personal output settings; production coordinates, moves, history and file format stay unchanged.

## Coordinate conventions

All distances use **8-to-5 steps**, with **1 step = 0.625 yards**. Step precision rounds the magnitude to the nearest increment; half-increment ties round away from zero. Rounded zero is described as **on** the reference, never **0 steps inside/behind**. Legacy decimal mode retains the existing decimal rounding operation.

| Convention | Meaning |
| --- | --- |
| Side 1 / Side 2 | Left / right half of the overhead chart, viewed from the front sideline |
| Front / back | Bottom / top of the overhead chart; increasing / decreasing Y |
| Inside / outside a yard line | Toward midfield / toward that side's goal line |
| X = 0 or X = 100 | Explicitly named goal lines, distinguished by side |
| Midfield | The 50-yard line, with no arbitrary side assignment when rounding places the output on it |
| Vertical reference | Nearest back sideline, back hash, front hash or front sideline |
| Reference ties | Higher 5-yard line for lateral ties; the reference nearer the back for vertical ties, allowing floating-point roundoff |
| College / high-school hashes | 20 yd / 160/9 yd from each sideline, matching the field renderer |

For a position 0.35 steps inside the Side 1 goal and 0.35 steps in front of the back hash, whole steps read **on the goal line; on back hash**, half steps read **0.5 steps** at each reference, and quarter steps read **0.25 steps**. The underlying point is identical in all three cases. The setting and conventions are available in Preferences and Help.

## Shared output and movement

`coordinateDescription` and its typed options live in `src/coordinates.ts` and are exported through the domain engine. Inspector, performer accessibility text, pointer/keyboard readouts, the read-only rehearsal preview, Cast, CSV, chart SVG accessibility text and performer PDFs consume the same formatter and settings. A memoized settings object avoids field redraws for unrelated preference/status updates. The standalone performer viewer remains owned by #57 and can consume this engine API; no new viewer is claimed here.

`performerMoveOutput` uses the same ordered endpoints as playback. The current validated path model supports straight, full-count moves. Direction refers to field axes, including diagonals; it does not infer performer facing or marching technique. Step size is expressed as **steps per 5 yards**, calculated from raw Euclidean distance and move counts. A larger number means a smaller physical step. Eased moves show both average size and peak size from the shared smoothstep profile (peak stride is 1.5 times average). These metrics do not use rounded arrival coordinates.

Opening sets say **Opening position** and have zero incoming counts. Stationary moves say **Hold for N counts** and have no fictitious step-size ratio. Zero-distance cases never divide by zero. Performer sheets include arrival coordinates, incoming counts and a movement column; their legend states the precision and coordinate conventions.

CSV retains its first 11 columns in the same order, including the existing three-decimal yard columns. It appends precision, travel distance, average step size, peak step size and direction. Opening/hold ratio cells are empty. Repeated prose is omitted to keep the 64,000-row maximum fixture within the existing 20 MiB native export limit. The default quarter-step fixture measures 19,816,870 bytes; the source regression also checks legacy two-decimal output against that limit. Existing limits and CSV formula neutralization remain in place.

## Validation and design evidence

Applies [design guidance](DESIGN_GUIDANCE.md) sections 2–5: existing labels, form controls, tooltip/focus behavior, typography, personal-preference storage and print styles are reused. No new theme or workspace layout is introduced. Larger layout, writer/device and school-hardware qualification remain with #16/#40/#43/#64/#3.

- Source cases cover whole/half/quarter rounding boundaries on both axes and sides, explicit goals, neutral midfield, both hash presets, ties, legacy preference migration, opening/hold/diagonal/eased movement, shared field/CSV/print wording and unchanged production serialization. Eased peak size is compared with the playback sampler's midpoint derivative.
- The existing preferences desktop suite changes precision through the actual UI and compares field focus, Inspector, Cast, read-only previews, sender-checked CSV output and dot-sheet DOM against the shared engine. Restart/reset checks preserve the chosen setting and unchanged project data/save status.
- The existing print suite adds whole-, half- and quarter-step examples containing an opening, a straight move, an eased move, a hold and a diagonal move. Independent Python inspection checks complete text, coordinate-row counts, paper dimensions and clipping. Existing 128-set/500-performer cases retain their coverage.
- Existing editor, accessibility, field and playback suites cover native export, text/focus behavior, read-only locks, geometry and rendering subscriptions. The maximum CSV guard prevents a larger presentation payload from silently breaking native export.
- Rendered pages and UI were inspected at 1366 × 768, 1120 × 768 and 125% UI zoom. The current theme and existing scroll access are retained. The prior three-column PDF and the new movement example intentionally use different demonstration fixtures; they illustrate the output structure, not a geometry edit.

Evidence: [preferences before](evidence/coordinate-output/preferences-before.png), [new preference](evidence/coordinate-output/preferences.png), [matching field and Inspector](evidence/coordinate-output/field.png), [narrow window](evidence/coordinate-output/narrow.png), [enlarged UI](evidence/coordinate-output/enlarged.png), [prior dot sheet](evidence/coordinate-output/sheet-before.png), [new dot sheet](evidence/coordinate-output/sheet.png).

Hosted platform results and remaining limitations are recorded in the implementation PR. Software/rendered-window checks do not substitute for the physical writer/device work tracked separately.
