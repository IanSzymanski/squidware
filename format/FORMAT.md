# The .squid project format

Squidware projects are local UTF-8 JSON files with a `.squid` extension. They contain formation geometry and move timing, with no account or network dependency. Current readers accept schema versions **1, 2, 3 and 4**. Ordinary saves write **v2**; nonempty tempo maps write **v3** and recording anchors write **v4** so older applications cannot silently discard timing. This is Squidware's format, with no claim of proprietary Pyware file compatibility.

Mapped timing is specified by [the v3 schema](squid-v3.schema.json), [tempo example](examples/tempo-v3.squid) and [v3 integration contract](../docs/schema-v3.md).

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

`paths` is a sparse performer-ID map. Omitted entries use the straight line between that performer's positions in the two endpoint pictures. An explicit path currently supports exactly one segment:

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

Versions greater than 5 fail with an instruction to update Squidware before opening or saving. Other invalid versions, broken JSON and unsupported paths produce actionable errors. Validation never overwrites the original file. Canonical v2 serialization rebuilds supported objects, emits compact JSON plus a trailing newline and enforces the byte limit. Geometry, timing, migration, round trips and schema examples are CI fixtures. A future format change must update this contract, schemas and compatibility evidence together.

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

Travel length uses adaptive de Casteljau subdivision with chord/control-polygon bounds, a total 0.001-yard bound gap and a depth cap of 20. The midpoint estimate differs from true length by at most 0.0005 yard when the budget converges (field-bounded cubic fixtures converge well before the cap). Average step size uses this length. Curved peak step size is blank/unavailable rather than inferred from the endpoint chord. Existing SVG/PDF charts show arrival positions; coordinate CSV/PDF movement descriptions identify curved travel and length. Neighbor overlays retain exact cubic vector paths. Editor playback and 3D receive positions from `sampleProject`; the separate performer viewer is not implemented yet.

Moves with curves explicitly report spacing/stride analysis unavailable until #76, including worker and reference analysis. They must not report a chord-based clearance result. Numeric Apply validates the whole candidate and records one named undo action; Cancel/Escape changes no project or history. The editor requires one explicitly selected performer, an arrival, paused playback and no other active input. Apply rechecks revision, project session, active move and selection.

Whole-move count changes retain controls and segment ID and update endCount. Splitting a move containing curves and set operations that change a surviving curved move’s predecessor fail atomically; remove its curves first. Deleting a move or its destination removes that move as usual. Detailed subdivision/reversal/copy policy belongs to #77. Removing a performer prunes its paths. Choosing Straight line explicitly removes the custom path.

Writers emit v5 whenever a cubic exists. V1–v4 wire files containing cubics are rejected, protecting older readers that cannot interpret curves. Removing all curves restores the least required version (v4 for alignment, v3 for a nonempty tempo map, otherwise v2). Legacy motion and straight-line arithmetic remain unchanged. V5 without curves is accepted and canonicalizes to the least required version on save. See [the v5 example](examples/curved-v5.squid) and [numeric editor guide](../docs/movement-paths.md).
