# Background transition checks

Issue [#9](https://github.com/IanSzymanski/squidware/issues/9) moves the current move's collision and stride checks into a bundled Web Worker. The opening set still has no incoming move. Thresholds, flag selection, travel-path actions, saved production geometry and the reference `analyzeTransition` API retain their existing behavior.

## Computation and invalidation

The broad phase sorts swept endpoint bounds along X and rejects separated Y ranges before evaluating continuous closest approach. Bounds include the configured minimum spacing. Dense or crossing paths can still require every pair; pruning never replaces the exact check. Easing uses the same inverse smoothstep and peak-stride formula as the brute-force reference in `domain.ts`.

The worker keeps an LRU cache of at most four moves. Coordinate-only edits recompute stride and candidate collision pairs involving changed performers, removing obsolete flags even when the new bounds no longer overlap. Unchanged moves reuse their results. Changes to roster identity/order/labels, counts, tempo, transition, absolute start count, thresholds, field or path model invalidate the affected move completely. Project replacement changes the editor epoch, including when the loaded project has the same ID; all old move caches are then discarded.

Correctness comparisons retain the reference's `1e-8` geometric boundary epsilon and forty-step inverse-smoothstep calculation. Tests compare complete issue arrays exactly, including severity, numeric count, message, performer order and stable ordering at ties. No additional numerical tolerance is introduced. Coverage includes randomized linear/eased paths, sparse and dense forms, crossing and stationary paths, exact spacing/severity boundaries, the A02 maximum fixture and all 124,750 pairs in a coincident 500-performer form.

## Worker and editor lifecycle

One move’s endpoint tracks, timing, model signature and rules cross the worker boundary at a time. The show is never serialized for analysis. The session-owned queue checks all moves, and dedicated subscribers render results without invalidating the editor shell or sibling Inspector controls during playback. The client coalesces requests within an event-loop turn and assigns monotonic revisions. Changed inputs synchronously hide their old flags before the next renderer update. Only a response matching the current revision and worker instance can become current.

Worker tasks yield after each 2,048 candidate visits, allowing superseding requests to cancel them cooperatively. Canceled tasks cannot commit their caches. Startup, execution, message-decoding and fifteen-second timeout failures clear flags and display a keyboard-accessible **Retry check** action. Retry creates a fresh worker; there is no synchronous analysis fallback. Unmount terminates the worker and clears both timers. Production uses the existing self-only script/worker policy, with no new Node bridge or network permission.

## Validation and design review

Run `pnpm test`, `pnpm test:contracts`, `pnpm build`, `pnpm test:native`, and the production desktop `analysis` suite. `pnpm perf:analysis` reproduces the compute comparison; see [performance results](performance.md#background-collision-analysis-a08).

The registered `analysis` suite compares real production-worker results with the reference at maximum size, tests localized edits, undo, rapid edits, set navigation and same-ID replacement, injects stale replies and worker failures, and activates a native keyboard nudge while worker delivery is held. It verifies keyboard retry after both message and constructor failures. The existing `playback` suite owns maximum-size native dragging and uncommitted preview isolation; `editor` owns preview/apply/undo and saved geometry. Local startup, editor, field and playback regression suites pass on the same product implementation.

[Design guidance](DESIGN_GUIDANCE.md) sections 2–4 apply: the check reuses Inspector typography, status colors, Lucide icons, shared buttons and help. Pending, error and ready states have text and distinct glyphs, with `aria-busy` and status announcements. Pending or failed checks never display a passing message. No workspace dimensions, physical coordinates or personal preference schema change. [Before/after, theme and enlarged-window evidence](evidence/analysis/README.md) records the rendered review. The existing flag badge's dense-count sizing is retained.

These are bounded Linux/Xvfb checks. Hosted CI remains responsible for Windows/macOS/Linux certification. Writer, assistive-technology and representative school-device qualification remain #64/#3. Worker compute gains do not establish a 60 fps editor or complete the separate whole-application performance gate.

## Show-wide review

The session-owned queue now checks all moves and retains unaffected results. Complete pagination, count navigation, timeline markers and isolated checks of both adjacent moves during a drag are documented in [Show-wide problems](show-wide-problems.md). Historical evidence above records the earlier selected-move-only UI. Current Inspector flags page in groups of 12 without truncation.
