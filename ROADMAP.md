# Squidware roadmap

Squidware v0.6.0 is the latest published desktop release for cast-to-chart drill design, adding precise field authoring to the v0.5.0 foundation. It covers 2D placement, basic formations, 3D rehearsal markers, count-based playback, local project files, and rehearsal exports. It is not a complete substitute for every mature Pyware workflow.

## Where work is tracked

**Current release status:** [v0.5.0](https://github.com/IanSzymanski/squidware/releases/tag/v0.5.0) and [v0.6.0 — Precise field authoring](https://github.com/IanSzymanski/squidware/releases/tag/v0.6.0) are published; their 17 and 19 planned implementation issues are completed. **v0.7 — Show timing and analysis** is active, with 0 of 15 issues completed. Start with [#9 — background collision analysis](https://github.com/IanSzymanski/squidware/issues/9), then [#13 — audio-clock playback](https://github.com/IanSzymanski/squidware/issues/13), respecting the maintained queue and hard prerequisites.

**Validation follow-up:** The maintainer accepted [#36](https://github.com/IanSzymanski/squidware/issues/36) for v0.6.0 on 2026-10-21 and carried its unperformed first-time discovery check into [#64](https://github.com/IanSzymanski/squidware/issues/64) for v1.0. No first-time human review is claimed. Writer/platform and representative school-hardware qualification remain #64/#3; signed distribution remains #72.

The [release plan](docs/RELEASES.md) groups the backlog into v0.5, v0.6, v0.7, v0.8, v0.9, v1.0, v1.1 and v1.2 milestones. Releases publish in order only after their issues are fulfilled and the desktop packages pass verification. [release-plan.json](release-plan.json) records the membership and hard dependencies used by the release coordinator.

[GitHub Issues](https://github.com/IanSzymanski/squidware/issues) is the source of truth for implementation scope, priority, dependencies, estimates and completion. Start with the [combined roadmap and audit tracker (#1)](https://github.com/IanSzymanski/squidware/issues/1) or the [dependency-ordered implementation queue](docs/IMPLEMENTATION_QUEUE.md). Each goal below links to its existing or newly created implementation issue; section numbers are themes, not implementation order.

Each implementation issue has exactly one `priority:P1`, `priority:P2` or `priority:P3` label (reserve `priority:P0` for a verified urgent blocker), matching priority text in its body, an active implementation rank, and an estimated remaining token-effort range. Priorities weigh correctness/reliability, user importance, prerequisites and estimated implementation cost. Token ranges are low-confidence planning estimates, not measured usage or delivery promises. Completed work leaves the active queue.

Keep issue labels, body priorities, dependency links, this roadmap mapping and the generated queue consistent whenever scope, evidence or completion changes. Check existing issues before adding a goal; update its owner rather than create a duplicate. Preserve maintainer decisions and do not close an issue until its own acceptance criteria are met. The queue documents the ranking and maintenance policy.

All implementation work follows the [shared design guidance](docs/DESIGN_GUIDANCE.md), consolidated from the audit-derived issues. Apply its relevant review checks and record evidence or a reasoned not-applicable result in the issue or implementation PR. New issues use the implementation-work template; retain the guidance link during backlog maintenance.

The themes below are planned development areas, not shipped features or delivery promises. Each should retain editable project compatibility, predictable undo/redo, and useful automated and interactive checks.

## 1. Strengthen the daily desktop workflow

- Add broader regression coverage for pointer gestures, keyboard focus, native save dialogs, playback, and PDF layout. — [#69](https://github.com/IanSzymanski/squidware/issues/69)
- Verify releases on Windows, macOS, and Linux, with accessibility and lower-performance graphics devices included in the review. — [#64](https://github.com/IanSzymanski/squidware/issues/64), [#69](https://github.com/IanSzymanski/squidware/issues/69)
- Add configurable recovery history and a recent-project list, with explicit recovery decisions when multiple versions exist. — [#7](https://github.com/IanSzymanski/squidware/issues/7), [#70](https://github.com/IanSzymanski/squidware/issues/70)
- Bundle or reference audio in portable project packages so reopening does not require manually reattaching a recording. — [#71](https://github.com/IanSzymanski/squidware/issues/71)
- Add configurable print styles, coordinate precision, page templates, and robust pagination for long productions. — [#34](https://github.com/IanSzymanski/squidware/issues/34), [#35](https://github.com/IanSzymanski/squidware/issues/35)
- Improve large-cast performance and report tested performer/set sizes instead of relying only on schema limits. — [#3](https://github.com/IanSzymanski/squidware/issues/3), [#9](https://github.com/IanSzymanski/squidware/issues/9), [#10](https://github.com/IanSzymanski/squidware/issues/10), [#11](https://github.com/IanSzymanski/squidware/issues/11), [#12](https://github.com/IanSzymanski/squidware/issues/12), [#15](https://github.com/IanSzymanski/squidware/issues/15)
- Add signed release builds and an update workflow once distribution infrastructure is available. — [#72](https://github.com/IanSzymanski/squidware/issues/72)

**Ready when:** the common create, edit, save, reopen, rehearse, and export workflows have repeatable tests on each supported platform and produce consistent printed output.

## 2. Curved travel and detailed timing

- Add editable per-performer paths with curves and intermediate control points. — [#73](https://github.com/IanSzymanski/squidware/issues/73)
- Support holds and submoves within a transition, with explicit arrival and departure counts. — [#74](https://github.com/IanSzymanski/squidware/issues/74)
- Show editable path handles, distances, and count ticks directly on the field. — [#75](https://github.com/IanSzymanski/squidware/issues/75)
- Extend minimum-spacing and stride analysis to curved paths and independently timed moves. — [#76](https://github.com/IanSzymanski/squidware/issues/76)
- Define consistent behavior for resizing move counts, reversing moves, and copying path segments. — [#77](https://github.com/IanSzymanski/squidware/issues/77)

**Ready when:** playback, coordinate previews, timing changes, undo, and collision checks agree on the same path model. A curve visible in the editor must be the curve used for movement and analysis.

## 3. Performer assignment and spacing tools

- Offer optional assignment optimization for selected performers and formation destinations. — [#78](https://github.com/IanSzymanski/squidware/issues/78)
- Preserve pinned assignments, sections, ordering constraints, and instrument/role restrictions. — [#78](https://github.com/IanSzymanski/squidware/issues/78)
- Compare travel distance, crossings, and step demand before applying a proposed assignment. — [#78](https://github.com/IanSzymanski/squidware/issues/78)
- Add spacing guides, interval controls, alignment, distribution, and richer formation handles. — [#25](https://github.com/IanSzymanski/squidware/issues/25), [#27](https://github.com/IanSzymanski/squidware/issues/27), [#79](https://github.com/IanSzymanski/squidware/issues/79)
- Support reusable formations and controlled transitions between them. — [#46](https://github.com/IanSzymanski/squidware/issues/46), [#49](https://github.com/IanSzymanski/squidware/issues/49), [#80](https://github.com/IanSzymanski/squidware/issues/80)
- Add editable Bézier curve/wave formations and seeded scatter regions with spacing controls. — [#98](https://github.com/IanSzymanski/squidware/issues/98), [#99](https://github.com/IanSzymanski/squidware/issues/99)

**Ready when:** the designer can preview, compare, accept, and undo a suggested assignment without losing performer identity or unintentionally changing other sets. Optimization must explain which constraints it uses.

## 4. Props, staging, and visual planning

- Add props and equipment with footprints, orientation, movement, and visibility by set. — [#81](https://github.com/IanSzymanski/squidware/issues/81)
- Support stages, indoor floors, custom field sizes, backgrounds, and non-football coordinate systems through the user interface. — [#82](https://github.com/IanSzymanski/squidware/issues/82)
- Add performer facing, richer instrument/guard representations, and optional costume color schemes. — [#83](https://github.com/IanSzymanski/squidware/issues/83)
- Add lightweight instrument and guard equipment models, a front-ensemble palette and an optional stadium backdrop. — [#91](https://github.com/IanSzymanski/squidware/issues/91), [#92](https://github.com/IanSzymanski/squidware/issues/92), [#93](https://github.com/IanSzymanski/squidware/issues/93), [#94](https://github.com/IanSzymanski/squidware/issues/94)
- Evaluate leg-motion mockups and basic count-driven lower-body poses and flag cues. — [#95](https://github.com/IanSzymanski/squidware/issues/95), [#96](https://github.com/IanSzymanski/squidware/issues/96), [#97](https://github.com/IanSzymanski/squidware/issues/97)
- Extend clearance checks to configured performer and prop footprints. — [#84](https://github.com/IanSzymanski/squidware/issues/84)
- Add saved cameras and renderable rehearsal/video previews with explicit quality settings. — [#85](https://github.com/IanSzymanski/squidware/issues/85)

**Ready when:** staging objects have a clear schema and edit workflow, remain consistent between 2D and 3D, and do not imply more accurate physical simulation than is actually implemented.

## 5. Teaching and rehearsal delivery

- Add rehearsal annotations, bookmarks, count ranges, and sectional playback. — [#86](https://github.com/IanSzymanski/squidware/issues/86)
- Provide performer-focused playback and a portable read-only viewer. — [#57](https://github.com/IanSzymanski/squidware/issues/57), [#58](https://github.com/IanSzymanski/squidware/issues/58), [#59](https://github.com/IanSzymanski/squidware/issues/59), [#60](https://github.com/IanSzymanski/squidware/issues/60)
- Create mobile-friendly dot books and configurable drill packet layouts. — [#35](https://github.com/IanSzymanski/squidware/issues/35), [#59](https://github.com/IanSzymanski/squidware/issues/59), [#60](https://github.com/IanSzymanski/squidware/issues/60)
- Support rehearsal revisions with change comparisons and revision labels. — [#61](https://github.com/IanSzymanski/squidware/issues/61), [#62](https://github.com/IanSzymanski/squidware/issues/62)
- Investigate documented interchange formats and importers for user-provided data with clear licensing and compatibility boundaries. — [#87](https://github.com/IanSzymanski/squidware/issues/87)

**Ready when:** an instructor can identify a revision, distribute the intended version, and trace a performer's movement across both printed and digital materials.

## 6. Optional cloud collaboration

- Keep local files and offline editing fully usable. — [#88](https://github.com/IanSzymanski/squidware/issues/88), [#89](https://github.com/IanSzymanski/squidware/issues/89), [#90](https://github.com/IanSzymanski/squidware/issues/90)
- Add optional project sync, named versions, and conflict handling. — [#89](https://github.com/IanSzymanski/squidware/issues/89)
- Define owner, editor, and viewer roles before sharing mutations between users. — [#88](https://github.com/IanSzymanski/squidware/issues/88)
- Support review comments and concurrent edits only after a clear merge and recovery model exists. — [#90](https://github.com/IanSzymanski/squidware/issues/90)
- Define storage, authentication, deletion, export, and privacy behavior in the product and documentation. — [#88](https://github.com/IanSzymanski/squidware/issues/88), [#89](https://github.com/IanSzymanski/squidware/issues/89)

**Ready when:** users understand what leaves the device, can recover conflicting edits, and can continue using their local productions without the service.

## Compatibility commitments

The `.squid` format is versioned JSON. Future schema changes should include migration tests and actionable messages when a newer file cannot be opened. Proprietary Pyware import/export is not currently implemented and should not be advertised without a supported, validated compatibility path.

Feature requests should describe an actual design or rehearsal task, an example production size, the expected result, and the current obstacle. This keeps development focused on dependable tools rather than a checklist of names.
