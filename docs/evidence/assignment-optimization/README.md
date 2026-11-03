# Constrained assignment review — 2026-11-03

Implements #78 using the existing formation preview/command/history boundary, persistent live membership, shared path lengths, playback sampling and bounded movement analysis. Compare is optional and local. Only selected member destinations on the chosen set change; both adjacent moves are measured without changing their definitions or timing.

## Validation

The source suite passes 801 tests, including 17 optimizer cases. Independent exhaustive enumeration checks both objectives for six seeded matrices at every size 1–7, with absent edges, ties and infeasible matchings. Cases cover all hard rules and unknown-role policies, explicit order sequences, physical objective tradeoffs, fixed holds/endpoints, forged/stale acceptance, cancellation/deadlines, exact identity/geometry, copy/detachment/vacancies, v11 round trips, full-length IDs and IDs matching object method names. Deterministic 2/64/500-member selections and a tied 500×500 matrix pass. Shared peak-demand bounds include eased travel, holds and independent submoves.

All 34 contract tests pass, including independent v11 JSON Schema, generated examples, semantic mapping rejection and old-version protection. All 92 native tests pass; a prohibited pairing cannot overwrite an existing saved production. The production build/typecheck and native startup smoke pass. These local Linux results do not claim hosted Windows/macOS/package certification.

The registered `assignment-optimization` Electron suite passes native pointer/select/text/number/keyboard interaction, incoming/outgoing fractional samples, path visibility, explicit role/pin/prohibited/order restrictions, unknown policy, infeasibility without partial work, Escape cancellation, keyboard proposal acceptance, one-step Apply/undo/redo and native save/reopen. Worker-constructor failure and a deliberately nonresponding worker verify explicit failure, termination/cancellation, successful retry and stale-selection rejection. Selection and project/history assertions accompany those states.

Related `live-formations`, `formation-assignment` and `scatter-formations` desktop suites pass in run `2026-11-03T20-50-31-488Z-cc32484f`. The final assignment run is `2026-11-03T21-00-49-067Z-38717d6c`; [run.json](run.json) retains its build/runtime/source identity and [results.json](results.json) records each check, layout measurement and comparison. Captures predate the archival evidence-file additions and a final guard that caps generated ordered-group names at the 80-character format limit. Captured behavior is retained. Final documentation/evidence is followed by a fresh build and startup smoke.

## Objective and performance evidence

The four selected members in [the comparison](assignment-comparison.png) initially travel 320 yd across two eased eight-count moves, with 12 all-cast spacing/crossing flags, eight stride flags and a peak demand bound containing 11.25 yd/count. Both proposals give zero travel/flags without moving slots or the unrelated pair. The independent physical two-member fixture documents a real tradeoff: shortest routes 0/10 yd, total 10 and peak 1.25 yd/count; balanced routes 6/6 yd, total 12 and peak .75 yd/count. Balanced minimizes squared member travel rather than a minimax, crossing or stride objective.

The real worker completes 2/64/500-member comparisons, including adjacent-move flags, in **112 / 209 / 2,236 ms** on this Linux software host. These are single native action-to-result observations, including input/frame work, not p95 guarantees or school-hardware qualification. [The 500-member result](assignment-500-members.png) compares:

| Mapping | Total yd | Longest member yd | Spacing/crossing flags | Stride flags |
| --- | ---: | ---: | ---: | ---: |
| Current | 11,477.51 | 51.14 | 13,754 | 209 |
| Shortest total | 9,514.62 | 45.14 | 6,725 | 158 |
| Balanced | 9,670.89 | 40.00 | 4,166 | 144 |

Remaining findings are intentionally visible. Lower distance does not certify clearance. Only selected distance/demand is measured; flags include the entire cast on both available adjacent moves. Cubic lengths use the existing bounded adaptive estimate; step demand uses conservative bounds. A complete exact matching is solved on that evaluated cost matrix. The worker has a 20-second work budget and a separate 30-second UI watchdog; neither failure accepts a partial mapping. Ordered groups fix explicit sequences to explicit slot sequences, a stronger rule than relative ordering alone. Missing instrument/role metadata remains explicit; user-entered tags belong to this formation until the separate Cast instrument/visual feature supplies a broader model.

## Design review

[Shared guidance](../../DESIGN_GUIDANCE.md) §§1–5 apply. The implementation reuses Modal, HelpButton/tooltips, NumberField, native selects, theme/disabled tokens, command dispatch, named history and the shared scaled-viewport variables. Selected states use text/borders; unavailable proposals/actions use dashed boundaries and reasons. Slot squares differ from performer circles. The main field remains one Tab stop, with numeric/count controls and ordinary keyboard buttons in the review dialog. Applying a reviewed mapping labels it **reviewed mapping**, rather than incorrectly retaining the original roster/positional label.

[Before](assignment-before.png), [constraints](assignment-constraints.png), [comparison](assignment-comparison.png), [infeasibility](assignment-infeasible.png), [worker failure](assignment-worker-unavailable.png) and [applied](assignment-applied.png) output were inspected. [Dark](assignment-dark-1366-1.png), [light](assignment-light-1366-1.png), [high contrast](assignment-high-contrast-1366-1.png) and [1120×768 at 125%](assignment-dark-1120-1.25.png) captures were reviewed. Dense output supports hiding paths while retaining comparison checks.

The default 1366×768 workspace field remains **485 px** high, above the approximate 470 px target. The transient comparison dialog supplies its own scrollable field preview, which deliberately occupies less vertical space to retain metrics and actions. At default scale the dialog is **1120×720 px** (x123–1243, y24–744). At the enlarged narrow size it is **1080×708 px** (x20–1100, y30–738). Cancel/Use stay visible, and body scroll width equals client width in every measured state. During review the shared modal width initially overrode the custom width, and raw viewport units cropped the scaled footer; final selectors and scaled viewport bounds resolve both. At enlarged scale the field preview can require body scrolling; the actions remain fixed and reachable. No human signoff or physical-device qualification is claimed or required under the validation policy.
