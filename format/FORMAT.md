# The .squid project format

Squidware projects are local UTF-8 JSON files with a `.squid` extension. They contain formation geometry and move timing, with no account or network dependency. Current readers accept schema versions **1–12**. Ordinary saves write **v2**; nonempty tempo maps write **v3**, recording anchors **v4**, whole-move cubic paths **v5**, independent movement intervals **v6**, and live formation membership **v7**, shared routes **v8**, editable Bézier formations **v9**, seeded scatter formations **v10**, and saved assignment constraints **v11**, and group route movement **v12**, so older applications cannot silently discard timing or geometry. This is Squidware's format, with no claim of proprietary Pyware file compatibility.

Independent movement is specified by [the v6 schema](squid-v6.schema.json) and [schedule example](examples/scheduled-v6.squid); full-move curves use [the v5 schema](squid-v5.schema.json). Mapped timing is specified by [the v3 schema](squid-v3.schema.json), [tempo example](examples/tempo-v3.squid) and [v3 integration contract](../docs/schema-v3.md).

Start with [basic-v2.squid](examples/basic-v2.squid), [v2 JSON Schema](squid-v2.schema.json), the [legacy example](examples/basic-v1.squid), and [v1 JSON Schema](squid-v1.schema.json). The checked-in [maximum example](examples/maximum-v2.squid) contains 500 performers across 128 pictures and 127 moves, with deterministic UUIDs. Regenerate these files with `pnpm format:generate`; `pnpm format:check` detects drift and validates examples with both an independent JSON Schema validator and the actual application codec. Schema IDs use repository URLs; for an immutable contract, pin the repository commit or a published release tag instead of following `main`.

## Coordinates and identities

Coordinates are yards. X increases from the left edge (0) to the right edge (100) when viewing the chart. Y increases from the back sideline (0) toward the front sideline (160/3). The front is at the bottom of the overhead chart. The field excludes end zones. Left/right chart halves are Side 1/Side 2; eight 8-to-5 steps span five yards, so one step is 0.625 yard. College hashes are 20 yards from each sideline; high-school hashes are one-third of the field depth from each sideline.

`field` has `width: 100`, `height: 160/3` and `preset: "college" | "high-school"`. Input height may differ by at most 0.001 yard; canonicalization restores exactly 160/3. Coordinates must be finite and inside the canonical field, including its edges. No value is silently clamped.

Every entity ID is a nonempty string of at most 128 ASCII letters, digits, underscores or hyphens. `__proto__`, `constructor` and `prototype` are forbidden. UUIDs are recommended, not required. Project, section, performer, selection-group, rehearsal-passage, picture and move collections have independent ID namespaces. IDs must be unique within each collection; segment IDs are scoped to their owning performer path. Names and roster order are not identities. Preserve IDs when editing the same entities.

## v2 properties

All listed properties are required; empty optional content uses the indicated empty value.

V2 additionally accepts optional `snapping: {steps: 8|6|12, subdivision: 1|2|4, target: "grid"|"markings", group: "anchor"|"individual"}`. All four fields are required when the object is present. These saved editing rules do not alter geometry or sampling. Missing rules, including v1 migrations, mean 8-to-5 whole steps and rigid anchor snapping. Older v2 readers discard this newly recognized optional property on save. See [grid semantics](../docs/GRID_SNAPPING.md).

V2 also accepts optional `selectionGroups: [{id, name, performerIds}]`: at most 64 named groups, each with an independent ID, a nonblank name of at most 80 UTF-16 code units, and 0–500 unique existing performer IDs. Group names reject all U+0000–U+001F controls, trim outer whitespace, and are unique after trimming and Unicode lowercase conversion. Groups may overlap and do not change section membership, geometry or sampling. Removing a performer prunes their ID from every group in the same undoable edit; empty groups remain named. Missing groups mean no saved groups. Readers predating this optional property discard it on save. Personal selection, geometric previews and filter state are not stored in groups. See [selection behavior](../docs/SELECTION_TOOLS.md).

V2 also accepts optional `rehearsal: [{id, name, notes, start, end?, focus}]`: at most 128 passages with unique IDs, nonblank names up to 160 UTF-16 code units and notes up to 10,000. Text follows the normal control-character rules. Omit `end` for a bookmark; include it for a range. Targets are `{kind: "set", setId}` or `{kind: "move", moveId, fromSetId, toSetId, count}`; local counts are finite numbers from 0 to 1,024 and may be fractional. Focus is `{kind: "all"}`, `{kind: "section", sectionId}` or `{kind: "performers", performerIds}` with 1–500 unique IDs. A separate resolver flags missing sets/moves/sections/performers, changed move endpoints, out-of-move counts, reversed/zero-length ranges and empty section focus. Such references are intentionally retained by the codec for explicit repair rather than rejected or silently retargeted. Saving a new or repaired passage requires valid resolved targets/focus. Missing `rehearsal` means no saved passages; older v2 readers discard the new optional property on save. Active range/focus, speed and Loop state are session data. See [rehearsal behavior](../docs/rehearsal-passages.md).

V2 accepts optional `meter: {numerator, denominator, grouping}`: an integer numerator from 1 to 32, denominator 2, 4, 8 or 16, and 1–32 positive integer groups whose sum equals the numerator. Each group is at most 32. One drill count is one denominator beat; tempo remains counts/minute. Without a score map, bars begin at show count 0 and continue across set boundaries. Missing meter means 4/4 with grouping `[4]`, including migrated v1 files. Older v2 readers discard this optional property on save. The optional score map below supplies meter changes and pickups; count-in, playback speed and click enablement are session data. See [metronome behavior](../docs/metronome.md).

V2 accepts optional `score: {firstMeasure, pickupCounts, changes, marks}`. All four fields are required when present. `firstMeasure` is an integer 1–1,000,000; `pickupCounts` is 0–31 and strictly less than the opening numerator. Changes are `{count, meter}`; marks are `{count, label}`. Each list has at most 256 entries, canonicalized in count order. Counts are integer absolute show counts: positive for changes, nonnegative for marks, never beyond current show duration. Change counts must be distinct and start full bars in the preceding meter. Marks require distinct counts and nonblank, trimmed labels of at most 80 UTF-16 code units without U+0000–U+001F controls, unique after Unicode lowercase conversion. The structural schema bounds counts by 127×1,024; the canonical codec additionally verifies current duration, bar boundaries, uniqueness, grouping sums and pickup consistency.

A pickup consists of the final beats of measure `firstMeasure-1`; the first full bar starts at count `pickupCounts`. Each change advances measure numbering continuously, starting a bar in its new meter. All counts remain denominator beats at the existing written counts/minute. Missing score means `{firstMeasure:1,pickupCounts:0,changes:[],marks:[]}` at runtime without adding metadata on read/save. Musical anchors remain at absolute counts through set/timing edits; a contradictory edit fails atomically rather than moving or clamping an event. Score metadata does not affect geometry, count/time conversion or the legacy sampling adapter. Older readers discard this optional property on save. See [score semantics](../docs/score-map.md) and the [score example](examples/score-v2.squid).

V2 accepts optional `analysisRules: {defaults, directions?, sections?}`. `defaults` requires `minimumSpacing` (yards) and `maximumStride` (peak yards/count), both finite from 0.1 to 5. `directions` maps only `forward`, `backward`, `sideways` to partial threshold overrides. Each of at most 64 unique existing-section entries is `{sectionId, minimumSpacing?, maximumStride?, directions?}`. Per-property precedence is defaults → section base → production direction → section direction. Missing rules use historical 1 yd / 1.25 yd-per-count defaults, independently of preferences. Empty overrides inherit; a pair uses the larger resolved spacing minimum.

Moves additionally accept optional `marchingDirections: {performerId: "forward"|"backward"|"sideways"}` with at most 500 unique existing performer keys. These are explicit designer declarations for the entire move, never a facing inference from position or travel. Omission means unknown, so direction-specific overrides do not apply. Rewiring a move clears its declarations; roster removal prunes its performer keys, and count edits retain them. Missing references and unsupported direction values are rejected before native saves. Older readers discard these newly recognized optional properties. See [rule semantics and direction limits](../docs/analysis-rules.md).

| Property | Meaning |
| --- | --- |
| `schemaVersion` | Integer 2. |
| `id`, `title`, `ensemble` | Project identity, nonblank title and ensemble name (which may be empty). |
| `field` | Geometry and hash preset described above. |
| `sections` | 1–64 `{id, name, color}` objects. Names are nonblank; colors are `#RRGGBB`. |
| `performers` | 0–500 `{id, label, name, sectionId}` objects. Labels are nonblank, names may be empty, and section references must exist. |
| `sets` | 1–128 ordered picture objects `{id, name, notes, positions}`. Names are nonblank; notes may be empty and include line breaks. |
| `sets[i].positions` | Exactly one `{x,y}` entry for every performer ID, with no missing/extra keys. |
| `moves` | Exactly `sets.length - 1` ordered adjacent moves. A one-picture show uses `[]`. |
| `openingTiming` | `{tempo, transition}` retained as inert legacy metadata. The opening picture is always at count zero, with no incoming move. |
| `audioOffsetSeconds` | Finite number from -3600 to 3600. Audio target time is show elapsed seconds plus this offset. Audio data, paths and URLs are not embedded by this version. |

Picture objects cannot contain `counts`, `tempo` or `transition`; those values belong on incoming moves. Rejecting misplaced timing avoids silently changing playback intent.

A move is `{id, fromSetId, toSetId, counts, tempo, transition, paths}`. Move i must connect picture i to picture i+1, in array order. There are no skipped/reversed/dangling endpoints. `counts` is an integer from 1 to 1024, `tempo` is a finite BPM value from 20 to 400 (fractional tempos are supported), and `transition` is `linear` or `ease`.

`paths` is a sparse performer-ID map. Omitted entries use the straight line between that performer's positions in the two endpoint pictures. In the v2 contract, an explicit path supports exactly one segment:

```json
{"segments":[{"id":"segment-a","kind":"line","startCount":0,"endCount":16}]}
```

`endCount` must equal the owning move's count duration. Segment geometry is derived from the endpoint pictures, so edits to them do not leave duplicated endpoints behind. Path performer IDs must exist. Unknown segment kinds, multiple segments and partial-count lines are rejected with an update/unsupported-path message. They are not silently replaced by straight lines. Curves, holds, submoves, props, facing, meters and tempo maps are outside this supported contract until their own implementations and fixtures land.

## Sampling and time

The arrival of picture k is the sum of the first k move counts. Clamp requested show counts to `[0, totalCounts]`; nonfinite requests sample count zero. At count zero, return the opening picture. For other counts, use the first move whose cumulative end count is greater than or equal to the requested count. Exact arrivals belong to the incoming move with progress 1; an immediately later fractional count belongs to the next move. `setIndex` therefore denotes the destination picture during a move, not necessarily a currently editable arrival.

Let `t = localCount / move.counts`. For `linear`, use `u = t`; for `ease`, use smoothstep `u = t*t*(3-2*t)`. A performer's position is `from + (to-from)*u` independently for X and Y. Local/show count readouts use t, not eased distance. Add `usedCounts * 60 / tempo` across moves for show elapsed seconds. Time-to-count consumes the same durations in order. Opening timing never contributes time.

In the basic example, performer A1 is at `(20,15)` on count 8 and `(40,25)` on count 20. Count 16 arrives at the second picture after 8 seconds; count 24 arrives at the final picture after 16 seconds. Explicit and implicit supported line paths sample identically.

## Limits and validation order

Files are limited to **10 MiB of UTF-8 bytes**, before JSON parsing and after serialization. A single leading BOM is accepted by the parser. JSON must describe an object, with finite numeric values. Text lengths are measured in JavaScript UTF-16 code units: title/ensemble/picture name 160, section name 80, performer label 32, performer name 120, picture notes 10,000. IDs have the 128-character rule above. Except in group names (rules above), tab, LF and CR are permitted; other U+0000–U+001F controls are rejected. Required names/title/labels must contain non-whitespace text. Other whitespace is preserved except for group-name trimming.

Use two validation passes: JSON Schema for structural/range constraints, then semantic validation for relationships and canonicalization. Standard JSON Schema cannot enforce unique IDs within object arrays, roster-key completeness, endpoint adjacency, matching path end counts group-name uniqueness, valid group membership, or the encoded file byte budget. Its `maxLength` normally counts Unicode code points, so a text consisting of supplementary characters may pass it but exceed the application's stricter UTF-16 limit. A schema-only result is not full acceptance. Enforce all constraints above, or use the reference validator:

```sh
pnpm install --frozen-lockfile
pnpm format:validate format/examples/basic-v2.squid
pnpm format:check
```

The reference tool runs schema validation and the same codec used by the renderer and native desktop file handlers. No remote schema fetch is needed. [projectV2.ts](../src/projectV2.ts), [projectValidation.ts](../src/projectValidation.ts) and [domain.ts](../src/domain.ts) implement validation, canonicalization and sampling.

Unknown informational properties are accepted and discarded at every canonicalized object level. They are not an extension-storage mechanism: keep private metadata in a sidecar if round-trip preservation matters. Required supported properties still validate. Unknown geometry/path semantics and v2 picture timing are explicitly rejected. Known optional content is represented by empty performer names, ensemble/notes strings, `paths: {}`, or `moves: []` in a one-picture show. Preferences, workspace state, history, save destinations and recovery metadata are stored separately.

## Migration and compatibility

In v1, each picture includes `counts`, `tempo` and `transition`. The opening count must be zero; all later counts are positive move durations. Migration first validates the entire v1 input. It retains project/entity IDs, roster order, positions, names, notes, timing, easing and audio offset; removes timing from pictures; creates adjacent moves named `move-v1-1`, `move-v1-2`, etc.; initializes their paths to `{}`; and preserves opening tempo/easing in `openingTiming`. Migration is deterministic and does not mutate input. Opening a legacy file changes it only in memory; explicit save writes v2. V2 move/segment identities cannot be losslessly represented in v1, so there is no supported downgrade command.

Versions greater than 6 fail with an instruction to update Squidware before opening or saving. Other invalid versions, broken JSON and unsupported paths produce actionable errors. Validation never overwrites the original file. Canonical v2 serialization rebuilds supported objects, emits compact JSON plus a trailing newline and enforces the byte limit. Geometry, timing, migration, round trips and schema examples are CI fixtures. A future format change must update this contract, schemas and compatibility evidence together.

## V3 tempo-map extension

V3 retains the complete v2 picture/move structure and adds required `tempoMap: {version: 1, regions, holds}`. Regions are `{startCount, endCount, startTempo, endTempo}`; holds are `{count, seconds}`. Both arrays have at most 256 entries. Counts are whole absolute show counts. BPM is finite 20–400; hold duration is finite 0.001–600 seconds. Regions have positive length, fit the current show and cannot overlap; holds use distinct counts strictly before the end. Adjacent regions are permitted. Arrays canonicalize in count order.

Ramps are linear BPM over counts; gaps retain base move tempos. Arrival at a held count is the start of its pause. Count/time conversion is monotonic; every second inside a hold returns the same count. Seeking chooses its earliest arrival. See [full timing/transport semantics](../docs/tempo-map.md).

Raw v1/v2 files with `tempoMap` are rejected. The codec reads v3 into its existing canonical internal v2 picture/move model while retaining the map, and serializes nonempty maps as wire v3. Empty maps are removed on save, restoring v2 output. There is no mapped-timing legacy downgrade. Native open/save, recovery and audio packages retain the map through the shared codec.

## v4 recording alignment

V4 retains the v2 picture/move fields, permits an optional v3 `tempoMap`, and requires a nonempty `audioAnchors` array of at most 256 `{count, seconds}` objects. `count` is a whole absolute show count in `[1,totalCounts]`; `seconds` is finite in `(0,86400]`, excluding `audioOffsetSeconds`. The implicit count-zero anchor is `(0,0)`. Anchors canonicalize by count and must have distinct counts and strictly increasing times. Each interval must be 0.05–20 times its nominal duration. The canonical codec enforces these semantic constraints beyond JSON Schema.

Nominal time includes written BPM ramps and fermatas. Interpolate nominal elapsed seconds linearly between successive anchors, then extrapolate the last interval's scale beyond the final anchor. Fermatas scale with their interval; arrival means the beginning of the hold. Add the global offset for recording time. Every transport and export uses the aligned compilation. Counts and geometry stay unchanged. Anchors refer to absolute counts through structural edits; edits that strand them or violate bounds fail atomically.

See [v4 JSON Schema](squid-v4.schema.json), [example](examples/aligned-v4.squid) and [complete alignment semantics](../docs/audio-alignment.md). Raw versions 1–3 containing `audioAnchors` are rejected. Canonical internal snapshots remain v2. Serialization chooses v4 for nonempty anchors, otherwise v3 for a nonempty tempo map, otherwise v2. Native saves, recovery and the existing v1 portable audio container all use the same codec. Plain projects contain no recording bytes or paths.


## V5 curved movement extension

V5 retains the canonical picture/move model, permits the v3 tempo map and v4 audio anchors independently, and adds a single full-move cubic Bézier segment to the existing line segment union. A curve is:

```json
{"segments":[{"id":"curve-a","kind":"cubic","startCount":0,"endCount":16,"control1":{"x":10,"y":30},"control2":{"x":30,"y":30}}]}
```

Endpoint positions come from the two picture sets, never duplicated on the segment. The two control points are absolute field yards, finite and inside the field (X 0–100, Y 0–53⅓). The convex-hull property therefore keeps the complete curve inside the field. Changing an endpoint picture retains the controls and ensures position continuity; tangent continuity between adjacent moves is not imposed. IDs stay with the move, performer and segment when edited. Exactly one segment covers `[0, move.counts]`; multiple segments, holds and partial-count paths remain unsupported.

Let t be clamped local count divided by move counts. For linear timing, u=t; for eased timing, u=t²(3−2t). Evaluate the cubic from the picture start, control1, control2 and picture end using de Casteljau at u. This is **Bézier parameter timing**, not constant distance speed. Endpoints are exact; coincident endpoints can form a loop, and coincident controls/endpoints can form a stationary curve. Each consumer uses the same count sampler; no frame/time-dependent curve state exists. Repeated save/reload reproduces double-precision samples exactly in the reference engine; cross-implementation comparison tolerance is 1e−9 yards.

Travel length uses adaptive de Casteljau subdivision with chord/control-polygon bounds, a total 0.001-yard bound gap and a depth cap of 20. The midpoint estimate differs from true length by at most 0.0005 yard when the budget converges (field-bounded cubic fixtures converge well before the cap). Average step size uses this length. The coordinate sheet’s scalar peak-step field stays blank rather than inferred from the endpoint chord; Problems reports the conservative peak-stride interval. Existing SVG/PDF charts show arrival positions; coordinate CSV/PDF movement descriptions identify curved travel and length. Neighbor overlays retain exact cubic vector paths. Editor playback and 3D receive positions from `sampleProject`; the separate performer viewer is not implemented yet.

[Detailed movement analysis](../docs/detailed-path-analysis.md) uses time-curve bounds in both worker and reference APIs. Confirmed and possible findings retain quantity bounds/count ranges; no chord-based clearance result substitutes for a curved check. Analysis results are transient and do not change the project wire format. Numeric Apply validates the whole candidate and records one named undo action; Cancel/Escape changes no project or history. The editor requires one explicitly selected performer, an arrival, paused playback and no other active input. Apply rechecks revision, project session, active move and selection.

Whole-move count changes retain controls and segment ID and update endCount. Splitting a move containing curves and set operations that change a surviving curved move’s predecessor fail atomically; remove its curves first. Deleting a move or its destination removes that move as usual. Reviewed count-resize, selected-path reversal and interval-copy/paste policies are specified in [detailed movement operations](../docs/path-operations.md). Detailed subdivision remains guarded. Removing a performer prunes its paths. Choosing Straight line explicitly removes the custom path.

Writers emit v5 whenever a cubic exists. V1–v4 wire files containing cubics are rejected, protecting older readers that cannot interpret curves. Removing all curves restores the least required version (v4 for alignment, v3 for a nonempty tempo map, otherwise v2). Legacy motion and straight-line arithmetic remain unchanged. V5 without curves is accepted and canonicalizes to the least required version on save. See [the v5 example](examples/curved-v5.squid) and [numeric editor guide](../docs/movement-paths.md).

## V6 independent movement intervals

V6 extends v5 with per-performer schedules of 1–32 ordered segments. `startCount` and `endCount` are finite local written counts within `[0, move.counts]`, may be fractional, and require `endCount > startCount`. Each start must be at or after the preceding end. Interval IDs are unique within each performer path. The reader rejects overlaps/order errors; it does not sort or clip them.

```json
{"segments":[
  {"id":"travel-a","kind":"line","startCount":2,"endCount":6,"to":{"x":20,"y":25}},
  {"id":"hold-a","kind":"hold","startCount":6,"endCount":8},
  {"id":"curve-a","kind":"cubic","startCount":8,"endCount":12,"control1":{"x":20,"y":35},"control2":{"x":30,"y":35}}
]}
```

Start at the performer's previous-picture position. Before departure and in every gap, hold the preceding arrival. Each travel begins at that point; nonfinal travel requires a field-bounded absolute `to` waypoint. The last travel omits `to` and arrives at the next picture's position, keeping that position through remaining counts. An explicit hold has no geometry and inherits the preceding point. A hold-only schedule requires identical endpoint pictures. Zero-distance travels, stationary cubics and loops are allowed. Adjacent intervals are position-continuous by construction; derivative continuity is not enforced.

For a travel interval `[a,b]` at local count c, t=(c−a)/(b−a). Apply the move's linear or smoothstep timing inside this interval and evaluate the same line/cubic math as v5. At departure return the preceding position, at arrival the exact target; at shared boundaries either side yields that same position. The legacy full-move line fast path preserves its historical floating-point arithmetic. Musical fermatas still operate on shared count/time conversion and do not become movement intervals. The [two-performer example](examples/scheduled-v6.squid) combines independent schedules with a musical fermata.

All coordinates/controls remain finite and inside the existing field bounds. A hold cannot include `to`, `control1` or `control2`. A final travel cannot duplicate the next picture via `to`. Semantic validation checks these rules, count bounds against the owning move, ID uniqueness and the existing UTF-8 file budget after structural schema validation. Unknown informational properties are still discarded; arbitrary properties are not extension storage or alternate geometry semantics.

Geometry/output consumers share the complete travel endpoint chain. Holds/gaps have zero distance. Cubic length estimates share the existing total 0.001-yard bound-gap budget across all travels. CSV/PDF descriptions identify local hold/travel windows and total distance; the single peak-step field stays blank. [Detailed analysis](../docs/detailed-path-analysis.md) reports conservative spacing/peak-stride bounds for the complete timed geometry. No viewer implementation or advanced path-operation support is implied.

V6 retains independently optional v3 tempo maps and v4 recording anchors. Writers choose v6 for any multi-interval, partial-count, hold or intermediate-waypoint path; otherwise they choose the least required prior version. The parser rejects scheduled geometry in v2–v5 move data rather than replacing it with a whole-move line. Legacy v1 files still migrate to implicit whole-move straight travel. Versions greater than 8 require updating Squidware. The [schedule editor](../docs/movement-schedules.md) and [movement operations](../docs/path-operations.md) describe undo, removal, endpoint edits, uniform count rescaling, selected-path reversal, interval copy/paste and the remaining split/rewire guards.


## V7 live formations

[V7 schema](squid-v7.schema.json) and [example](examples/live-v7.squid) retain the full v6 contract, with independently optional tempo maps and recording anchors. Pictures may contain `liveFormations: [{id, name, kind, options, slotCount, members}]`. Missing or empty lists mean ordinary dots; canonical readers omit empty lists. Writers choose v7 whenever any picture has a live formation, including when v6 schedules or v5 curves are also present. All incoming v1–v6 files containing this property are rejected rather than silently losing membership. Canonical editor data remains schemaVersion 2. Legacy downgrade refuses live formations.

Each picture has at most 500 shapes, with unique IDs and trimmed, case-insensitive unique names (1–80 UTF-16 code units, no U+0000–U+001F). Shape IDs are scoped to their picture. `kind` is `line|arc|circle|block|curve`. `options` contains `center: {x,y}`, `width` (0.1–200 yd), `height` (0–200 yd; arc bulge), `rotation` (−3600°–3600°), `columns` (integer 1–500), and `assignment: position|roster`. Centers lie inside the field; all numbers are finite.

`slotCount` is an integer 1–500. `members` has 1–slotCount objects `{performerId, slot}`, referencing existing cast IDs and unique integer slots from 0 through slotCount−1. A performer has at most one owner on a picture. Canonical members sort by slot. Generate the established parametric shape for slotCount points, then assign each attached performer the point at their slot; vacancies remain unoccupied. Stored picture positions must match within 0.000001 yd. Generated member points outside the field are rejected; edge error up to 1e-8 yd is absorbed. No other dot moves during validation. Shapes supply editing metadata; playback, analysis, print and exports continue to read the same canonical picture positions.

Manual position edits detach moved members, roster removal prunes membership, and empty shapes disappear in that same undoable edit. Remaining slots and geometry do not change. Membership edits and explicit redistribution use the displayed positional/roster assignment, reset slotCount to attached count and fill slots consecutively. Geometry edits preserve slots; switching assignment explicitly redistributes. New members never join automatically. Cross-set copying is a reviewed preview and cannot steal ownership. Duplicate picture clones metadata with fresh IDs; new/hold/insert-before pictures have no live metadata. See [editor behavior](../docs/live-formations.md).


## V8: shared routes

[V8 schema](squid-v8.schema.json) and [example](examples/routes-v8.squid) retain v7 live formations, v6 schedules and optional timing/alignment data. A production may contain `sharedRoutes: [{id, name, closed, start, segments}]`. Each segment has a unique stable ID, `kind: "line" | "cubic"` and explicit `to`; cubics also carry `control1`/`control2`. There are no performer IDs, counts, delays or raw captured strokes. The chain starts at `start`; every subsequent segment starts at the previous `to`. A closed route's last `to` must equal `start` exactly. Its seam may be a corner; tangent alignment and speed continuity are not implied.

At most 64 routes, with unique IDs and case-insensitive trimmed names of 1–80 characters without controls, are allowed per production. Every route contains 1–32 segments with finite, in-field endpoints and controls. Every segment must have at least 0.01 yard of travel according to the shared length evaluator. Duplicate segment IDs, invalid closure, unsupported segment kinds, stale IDs and invalid geometry reject atomically. Names/IDs, closure and minimum length are semantic constraints beyond JSON Schema. Line segments reject cubic control properties. Empty route lists canonicalize to omission.

Writers choose v8 whenever a nonempty route library exists. Without routes they retain the least required v2–v7 version. Incoming v1–v7 files containing `sharedRoutes` reject rather than losing geometry; canonical editor validation still accepts routes in schema 2 snapshots. Legacy downgrade refuses routes. Renderer, native file saves, packages and recovery share the canonical codec and serialize fitted geometry only. [Editor behavior and bounded sampling](../docs/shared-routes.md) distinguish distance along a route from later group movement and count mapping (#50).

## Editable Bézier formations (v9)

A live formation of kind `curve` may include `bezier: {anchors}`. Each of 2–33 ordered anchors has a unique stable `id`, `point`, `incoming`, `outgoing` (field-space yards), and `mode` (`corner`, `smooth`, `symmetric`). All coordinates, including inactive endpoint handles, must be finite and inside the field. Consecutive anchors define cubic segments with the earlier outgoing and later incoming controls. Every segment must contain at least 0.01 yd of travel.

Corner handles are independent. At interior joins, smooth handles are oppositely aligned, preserving their independent lengths; symmetric handles also have equal lengths within 1e-6 yd. Zero handles are supported. Endpoint modes govern handle editing but have no two-sided continuity constraint. Slot count must be 2–500; members retain their stored slots, including gaps after detachment. Slots include endpoints and use the shared adaptive arc-length sampler (.001 yd total length budget, .0005 yd local parameter bound). Stored member positions must agree within 1e-6 yd with that evaluator. Geometry is authoritative; controls and modes survive reopening without refitting.

Older wire versions containing `bezier` are rejected. Current applications still write the earliest supported version needed by the production; ordinary and v7/v8 projects retain their formats. See [the v9 schema](squid-v9.schema.json), [example](examples/bezier-v9.squid), and [editing behavior](../docs/bezier-formations.md).

## Seeded scatter formations (v10)

A live formation with a `block` container may include `scatter`. It cannot also contain Bézier geometry. Required fields are `version:1`, a nonblank seed of 1–80 UTF-16 units without control characters, `region:{kind,vertices}`, `minimumSpacing` (finite .1–100 yd), `distribution` (`uniform` or `clustered`), `clusterStrength` (finite 0–1), `points` and `pinnedSlots`. Rectangle/ellipse regions have two opposite bounding vertices; simple polygons have 3–32 ordered vertices. All vertices and points are finite physical field coordinates. Region width/depth must be at least .1 yd and area at least .01 square yard. Polygon edges must be at least .01 yd long; non-adjacent edges cannot touch or cross.

The points array contains exactly `slotCount` accepted positions, including reserved vacant slots. Every point is inside the region and every pair meets minimum spacing within 1e-8 yd. Pins are unique integer occupied-slot indexes. Member positions must agree with their stored slot coordinates within the existing 1e-6 yd live-formation tolerance. Generic parametric options remain part of the container but do not generate scatter geometry. Canonical readers use the stored positions directly; they do not regenerate from the seed. Manual overrides remain valid if geometric constraints hold.

Old wire versions containing scatter metadata are rejected; v10 is written only when needed. The [v10 schema](squid-v10.schema.json), [example](examples/scatter-v10.squid) and [editing/generation semantics](../docs/scatter-formations.md) document structural and semantic validation. Generation version 1 and project wire version 10 are separate version numbers.


## Assignment constraints (v11)

Live formations may include `assignmentConstraints: {pins, forbidden, sectionSlots, roleSlots, roles, unknownRoles, orderedGroups}`. All fields are required when present. Pins (at most 500) and prohibited pairs (at most 5,000) are `{performerId, slot}` with unique pairings; each member has at most one pin. Section/role slot lists (at most 500 each) are `{slot, sectionId}` and `{slot, role}`, with one rule of each kind per slot. Slots are zero-based integers below the formation's slot count, including vacant slots. Referenced performers must be members; section references must exist. IDs follow the normal 128-character contract.

`roles` maps at most 500 member IDs to explicit nonblank tags of at most 40 UTF-16 code units without U+0000–U+001F controls. Tags and required roles trim outer whitespace and match case-sensitively. Missing tags mean unknown. `unknownRoles` is `"reject"` or `"allow"`: it governs only unknown members in role-restricted slots and never allows a known mismatching role. These formation-specific instrument/role tags do not infer or replace Cast metadata.

At most 64 ordered groups contain `{id, name, performerIds, slots}`. Group IDs are unique; names are nonblank, trimmed and at most 80 characters without controls. Each group has matching lists of 2–500 member IDs and strictly increasing slot numbers. A performer appears in at most one group. The member sequence maps exactly to the slot sequence, reserving those slots; this is stronger than a relative-order-only rule. Canonical validation checks reference validity, uniqueness and current membership compliance with all pins, prohibitions, section/role rules and ordered groups. Contradictory mappings cannot be loaded/saved. JSON Schema alone cannot establish those semantic invariants.

Constraints are optional; the writer uses v11 when any live formation carries them. Earlier wire versions containing this property reject before parsing instead of discarding restrictions. The canonical editor model remains schema 2. Native saves, recovery and project packages use the same codec. [V11 schema](squid-v11.schema.json), [portable example](examples/assignment-v11.squid) and [comparison behavior](../docs/assignment-optimization.md) define persistence and editing. Clearing constraints in review removes the property. Detachment prunes removed identities, retains occupied member slots and keeps vacant section/role rules.

## v12 group route movement

[Schema v12](squid-v12.schema.json) and [the example](examples/group-v12.squid) add optional `moves[].groupMotions`. A nonempty group list requires v12; other productions retain their least required version. Canonical in-memory projects remain v2. Versions 1–11 cannot carry the group field, including an empty list; readers reject rather than silently discard it. Runtime-derived paths containing `linearCounts` cannot be stored in `paths`.

Each group contains `{id, name, routeId, mode, members, delay, interval, offsetDirection, phase, speed, entryCounts, exitCounts, endpointPolicy, cues}`. IDs obey the existing 128-character nonreserved rule; group IDs and trimmed, case-insensitive names are unique within the move. Names have 1–80 UTF-16 code units without control characters. `routeId` references a production shared route. `members` is an ordered list of 2–500 existing, unique performer IDs; memberships across groups on a move are disjoint. A move has at most 32 groups.

`mode` is `follow`, `countermarch` or `conveyor`; `endpointPolicy` is `reject` or `hold`; `offsetDirection` is −1 or +1. Delay is finite 0–4,096 counts, interval 0.01–1,000 yd, phase −1,000,000–1,000,000 yd and speed 0.001–100 yd/count. Entry/exit counts are nonnegative and their sum is strictly less than move counts. Every group contains 1–32 `{count, direction}` cues; directions are −1, 0 or +1. Cue counts increase strictly, precede the route-window duration and start at or before zero. Negative cues cannot precede `−(members−1)×delay` (or zero for conveyor). Counter-march requires both nonzero directions.

The route-local clock starts after the straight entry connector and ends before the straight exit connector. Let `L(t) = phase + speed × integral(direction, 0, t)`, with the first cue direction extended before its clock. Follow/counter-march member rank r samples `L(t − r×delay)`; conveyor rank r samples `L(t) + offsetDirection×r×interval`. Delay and distance offset are separate quantities. Cue changes are instantaneous travel-direction changes at continuous positions; facing/acceleration are not implied. A zero direction holds until another cue. All group pieces, including connectors, use linear counts independently of `move.transition`; show count/tempo mapping remains authoritative.

Open-route sampling clamps when endpoint policy is hold; reject policy refuses any member leg outside the route-distance range (10⁻⁸-yard numerical tolerance). Closed sampling wraps both signs at the exactly coincident seam. Open conveyor capacity is `(n−1)×interval ≤ routeLength`; closed capacity is `n×interval ≤ routeLength` including the last-to-first gap. Capacity, shared route references, cue ordering, connector compatibility and per-project work budgets are semantic constraints beyond JSON Schema. Positive entry/exit durations explicitly connect saved endpoint dots. Zero-duration connectors require those dots to match the sampled route position within 10⁻⁸ yard. Endpoint pictures are never silently modified.

Resolve distances with the shared-route bounded lookup described in v8. Crop each traversed lookup cell's original line/cubic by de Casteljau, time it linearly by the cell's distance span, and include explicit stops/open-end holds and entry/exit connectors. All playback/analysis/output consumers use that same runtime expansion; no consumer independently refits the captured stroke. Individual `paths` remain stored but dormant for grouped members and return on removal. File data contains only base paths and the group program/reference, not expanded travel intervals.

Runtime work is bounded to 4,096 generated intervals/member, 100,000/move and 200,000/project, and at most 16 route lengths in a single closed travel leg. Excessive work or timings too small to represent reject without partial loading/saving. See [operation, sampling and numerical policies](../docs/group-movement.md) for count resizing, copying, full-group reverse, negative history and unsupported partial operations. The native bridge uses the same validation before file replacement.
