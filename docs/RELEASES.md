# Squidware release plan

Releases progress in order from v0.5 through v1.2. GitHub milestones own live scope/status; [release-plan.json](../release-plan.json) owns membership and hard prerequisites. Versions and grouping are planning decisions, not delivery dates. Issue acceptance criteria and required human/device evidence remain in force.

## v0.5 — Reliable foundation

Versioned project schema and migration; named undo; asynchronous recovery; accurate save status; accessible core interactions and preferences; repeatable regression coverage.

7/17 implementation issues completed at reconciliation.

- [x] [#2 · Audit A01 Choose and publish the repository's open-source license](https://github.com/IanSzymanski/squidware/issues/2)
- [x] [#4 · Audit A03 Extract the editor store and central command registry from App.tsx](https://github.com/IanSzymanski/squidware/issues/4)
- [x] [#8 · Audit A07 Drive all editor limits from PROJECT_LIMITS](https://github.com/IanSzymanski/squidware/issues/8)
- [x] [#15 · Audit A14 Make 3D rendering demand-driven and preserve the WebGL renderer](https://github.com/IanSzymanski/squidware/issues/15)
- [x] [#19 · Audit A18 Show live cursor coordinates and performer hover details](https://github.com/IanSzymanski/squidware/issues/19)
- [x] [#23 · Audit A22 Make between-set preview mode explicit and offer direct editing recovery](https://github.com/IanSzymanski/squidware/issues/23)
- [x] [#5 · Audit A04 Introduce schema v2 with separate sets and moves plus v1 migration](https://github.com/IanSzymanski/squidware/issues/5)
- [ ] [#6 · Audit A05 Replace snapshot undo with named transactions and coalesced edits](https://github.com/IanSzymanski/squidware/issues/6)
- [ ] [#7 · Audit A06 Move recovery to asynchronous main-process storage](https://github.com/IanSzymanski/squidware/issues/7)
- [ ] [#38 · Audit A40 Separate explicit file-save status from recovery and draft status](https://github.com/IanSzymanski/squidware/issues/38)
- [ ] [#37 · Audit A39 Fix field keyboard navigation, text sizes and contrast](https://github.com/IanSzymanski/squidware/issues/37)
- [ ] [#39 · Audit A41 Add versioned personal preferences separate from project files](https://github.com/IanSzymanski/squidware/issues/39)
- [ ] [#10 · Audit A09 Limit thumbnail rerenders and use constant-time selection membership](https://github.com/IanSzymanski/squidware/issues/10)
- [ ] [#11 · Audit A10 Isolate playback subscriptions and memoize the static 2D field](https://github.com/IanSzymanski/squidware/issues/11)
- [ ] [#66 · Audit A38 Build accessible, state-aware tooltips from command metadata](https://github.com/IanSzymanski/squidware/issues/66)
- [ ] [#69 · Roadmap Expand cross-platform regression coverage for daily desktop and print workflows](https://github.com/IanSzymanski/squidware/issues/69)
- [ ] [#47 · Audit A48 Publish the versioned .squid format and compatibility fixtures](https://github.com/IanSzymanski/squidware/issues/47)

## v0.6 — Precise field authoring

Dense-field selection, formations, exact transforms, coordinate entry, spacing and snapping, shared Cast selection, workspace controls and accessible display choices.

0/19 implementation issues completed at reconciliation.

- [ ] [#16 · Audit A15 Reclaim field space with compact editor chrome](https://github.com/IanSzymanski/squidware/issues/16)
- [ ] [#18 · Audit A17 Expose context-sensitive selection actions and Inspector sections](https://github.com/IanSzymanski/squidware/issues/18)
- [ ] [#20 · Audit A20 Fix dense-formation hit testing and label readability](https://github.com/IanSzymanski/squidware/issues/20)
- [ ] [#21 · Audit A21 Support configurable grids and explicit group snapping modes](https://github.com/IanSzymanski/squidware/issues/21)
- [ ] [#22 · Audit A19 Parse drill-language coordinates and support exact group moves](https://github.com/IanSzymanski/squidware/issues/22)
- [ ] [#25 · Audit A24 Preview formations with direct field handles and safe application](https://github.com/IanSzymanski/squidware/issues/25)
- [ ] [#26 · Audit A25 Preserve positional order when assigning performers to formations](https://github.com/IanSzymanski/squidware/issues/26)
- [ ] [#27 · Audit A26 Add exact rotate, scale, mirror and pivot transforms](https://github.com/IanSzymanski/squidware/issues/27)
- [ ] [#30 · Audit A30 Show previous and next set ghosts with neighboring paths](https://github.com/IanSzymanski/squidware/issues/30)
- [ ] [#32 · Audit A34 Make Cast a panel with shared field selection](https://github.com/IanSzymanski/squidware/issues/32)
- [ ] [#33 · Audit A27 Add additive section selection, lasso, rank/file selection and saved groups](https://github.com/IanSzymanski/squidware/issues/33)
- [ ] [#34 · Audit A36 Make coordinate output precision and move descriptions configurable](https://github.com/IanSzymanski/squidware/issues/34)
- [ ] [#36 · Audit A37 Standardize action labels, icons and redundant entry points](https://github.com/IanSzymanski/squidware/issues/36)
- [ ] [#40 · Audit A42 Add resizable panels, workspace presets and focus mode](https://github.com/IanSzymanski/squidware/issues/40)
- [ ] [#42 · Audit A43 Add field display preferences and reversible orientation](https://github.com/IanSzymanski/squidware/issues/42)
- [ ] [#43 · Audit A44 Introduce neutral dark/light themes, UI scaling and high contrast](https://github.com/IanSzymanski/squidware/issues/43)
- [ ] [#65 · Audit A65 Add a drill-aware command palette and rebindable shortcuts](https://github.com/IanSzymanski/squidware/issues/65)
- [ ] [#67 · Audit A66 Unify nudge behavior and make edit increments configurable](https://github.com/IanSzymanski/squidware/issues/67)
- [ ] [#79 · Roadmap Add spacing guides, exact interval controls, alignment and distribution](https://github.com/IanSzymanski/squidware/issues/79)

## v0.7 — Show timing and analysis

Audio-clock playback, metronome, set/timeline editing, meter and tempo maps, portable audio and show-wide movement analysis.

0/15 implementation issues completed at reconciliation.

- [ ] [#9 · Audit A08 Run incremental collision analysis in a Web Worker with broad-phase filtering](https://github.com/IanSzymanski/squidware/issues/9)
- [ ] [#13 · Audit A12 Use the attached audio track as the playback clock](https://github.com/IanSzymanski/squidware/issues/13)
- [ ] [#14 · Audit A13 Schedule a meter-aware metronome on the audio clock](https://github.com/IanSzymanski/squidware/issues/14)
- [ ] [#17 · Audit A16 Add a compact set list with drag reorder and jump-to-set](https://github.com/IanSzymanski/squidware/issues/17)
- [ ] [#24 · Audit A23 Split a transition at a selected count into a new set](https://github.com/IanSzymanski/squidware/issues/24)
- [ ] [#28 · Audit A28 Make the production sheet editable with spreadsheet paste](https://github.com/IanSzymanski/squidware/issues/28)
- [ ] [#29 · Audit A29 Give add, duplicate, hold and insert-before sets distinct behavior](https://github.com/IanSzymanski/squidware/issues/29)
- [ ] [#31 · Audit A33 Add timeline zoom, set-aware labels and one-count stepping](https://github.com/IanSzymanski/squidware/issues/31)
- [ ] [#44 · Audit A45 Store per-section and per-direction analysis rules in the project](https://github.com/IanSzymanski/squidware/issues/44)
- [ ] [#45 · Audit A32 Add show-wide problems with count navigation and live field overlays](https://github.com/IanSzymanski/squidware/issues/45)
- [ ] [#51 · Audit A51 Add measures, meter, rehearsal marks and pickup counts](https://github.com/IanSzymanski/squidware/issues/51)
- [ ] [#52 · Audit A52 Support tempo changes, ramps and fermatas within a move](https://github.com/IanSzymanski/squidware/issues/52)
- [ ] [#53 · Audit A53 Align the tempo map to audio using per-set/count anchors](https://github.com/IanSzymanski/squidware/issues/53)
- [ ] [#71 · Roadmap Package or reference audio portably when saving and reopening productions](https://github.com/IanSzymanski/squidware/issues/71)
- [ ] [#86 · Roadmap Add rehearsal annotations, bookmarks, count ranges and sectional playback](https://github.com/IanSzymanski/squidware/issues/86)

## v0.8 — Reusable forms and detailed motion

Editable live formations, curved paths, holds and submoves, constrained assignment, controlled transitions, scatter and wave editing, and canvas rendering.

0/13 implementation issues completed at reconciliation.

- [ ] [#12 · Audit A11 Render dynamic performer layers on canvas during playback and dragging](https://github.com/IanSzymanski/squidware/issues/12)
- [ ] [#46 · Audit A46 Add reusable and shareable show templates and formation libraries](https://github.com/IanSzymanski/squidware/issues/46)
- [ ] [#49 · Audit A49 Persist live formation objects that remain editable after application](https://github.com/IanSzymanski/squidware/issues/49)
- [ ] [#73 · Roadmap Model and sample editable curved performer paths with intermediate control points](https://github.com/IanSzymanski/squidware/issues/73)
- [ ] [#74 · Roadmap Support performer holds and submoves with explicit arrival and departure counts](https://github.com/IanSzymanski/squidware/issues/74)
- [ ] [#75 · Roadmap Draw and edit performer travel paths with handles, distances and count ticks](https://github.com/IanSzymanski/squidware/issues/75)
- [ ] [#76 · Roadmap Extend spacing and stride analysis to curved and independently timed paths](https://github.com/IanSzymanski/squidware/issues/76)
- [ ] [#77 · Roadmap Define count-resize, reverse and copy operations for detailed movement paths](https://github.com/IanSzymanski/squidware/issues/77)
- [ ] [#78 · Roadmap Optimize performer-to-destination assignment with pinned and role constraints](https://github.com/IanSzymanski/squidware/issues/78)
- [ ] [#80 · Roadmap Preview and edit controlled transitions between reusable formations](https://github.com/IanSzymanski/squidware/issues/80)
- [ ] [#50 · Audit A50 Model follow-the-leader, counter-march and conveyor-belt movement](https://github.com/IanSzymanski/squidware/issues/50)
- [ ] [#98 · Formations Add point-based Bézier editing for curve and wave formations](https://github.com/IanSzymanski/squidware/issues/98)
- [ ] [#99 · Formations Add controlled scatter forms with seeded distribution and spacing constraints](https://github.com/IanSzymanski/squidware/issues/99)

## v0.9 — Staging and 3D choreography

Props, custom fields, facing and costumes, instrument and guard assets, front ensemble, stadium, leg motion and simple count-driven choreography.

0/13 implementation issues completed at reconciliation.

- [ ] [#41 · Audit A31 Support simultaneous editable 2D and live 3D review](https://github.com/IanSzymanski/squidware/issues/41)
- [ ] [#81 · Roadmap Add props and equipment with per-set footprint, orientation and movement](https://github.com/IanSzymanski/squidware/issues/81)
- [ ] [#82 · Roadmap Expose indoor stages, custom fields, backgrounds and coordinate systems](https://github.com/IanSzymanski/squidware/issues/82)
- [ ] [#83 · Roadmap Add performer facing, instrument and guard visuals, and costume color schemes](https://github.com/IanSzymanski/squidware/issues/83)
- [ ] [#84 · Roadmap Check performer and prop clearance using configured physical footprints](https://github.com/IanSzymanski/squidware/issues/84)
- [ ] [#85 · Roadmap Save camera views and export rehearsal video previews with quality settings](https://github.com/IanSzymanski/squidware/issues/85)
- [ ] [#91 · 3D assets Add lofi marching instrument models and performer attachments](https://github.com/IanSzymanski/squidware/issues/91)
- [ ] [#92 · 3D assets Add lofi color guard flag, rifle and saber models](https://github.com/IanSzymanski/squidware/issues/92)
- [ ] [#93 · 3D assets Add lofi front ensemble equipment palette](https://github.com/IanSzymanski/squidware/issues/93)
- [ ] [#94 · 3D environment Add an optional lofi stadium around the rehearsal field](https://github.com/IanSzymanski/squidware/issues/94)
- [ ] [#95 · 3D animation prototype Create count-driven leg animation mockups](https://github.com/IanSzymanski/squidware/issues/95)
- [ ] [#96 · 3D choreography Add simple lower-body pose cues for second position and plié](https://github.com/IanSzymanski/squidware/issues/96)
- [ ] [#97 · 3D choreography Add count-timed flag up/down cues](https://github.com/IanSzymanski/squidware/issues/97)

## v1.0 — Validated rehearsal release

Rehearsal print and performer delivery, offline viewing, recent-project recovery, signed distribution/update workflow, representative hardware acceptance and actual writer/platform validation.

0/9 implementation issues completed at reconciliation.

- [ ] [#3 · Audit A02 Establish maximum-size performance baselines and budgets](https://github.com/IanSzymanski/squidware/issues/3)
- [ ] [#35 · Audit A35 Improve rehearsal print layouts, paths and performer highlighting](https://github.com/IanSzymanski/squidware/issues/35)
- [ ] [#57 · Audit A57 Build a read-only performer viewer using the shared engine](https://github.com/IanSzymanski/squidware/issues/57)
- [ ] [#58 · Audit A58 Export a self-contained offline performer viewer from desktop](https://github.com/IanSzymanski/squidware/issues/58)
- [ ] [#59 · Audit A59 Generate a geometry-backed 'my next move' card](https://github.com/IanSzymanski/squidware/issues/59)
- [ ] [#60 · Audit A60 Add sunlight mode, large rehearsal controls and offline PWA behavior](https://github.com/IanSzymanski/squidware/issues/60)
- [ ] [#64 · Audit A64 Validate audit priorities with drill writers and supported-platform walkthroughs](https://github.com/IanSzymanski/squidware/issues/64)
- [ ] [#70 · Roadmap Add a recent-project list with missing-file and recovery reconciliation](https://github.com/IanSzymanski/squidware/issues/70)
- [ ] [#72 · Roadmap Add signed release builds and a verified desktop update workflow](https://github.com/IanSzymanski/squidware/issues/72)

## v1.1 — Hosted delivery and advanced analysis

Hosted immutable performer releases, QR/privacy/revisions, optional release synchronization, documented interchange and advisory analysis.

0/7 implementation issues completed at reconciliation.

- [ ] [#54 · Audit A54 Add an exploratory sound-delay and ensemble-spread map](https://github.com/IanSzymanski/squidware/issues/54)
- [ ] [#55 · Audit A55 Add form-quality metrics for intervals, lines and arcs](https://github.com/IanSzymanski/squidware/issues/55)
- [ ] [#56 · Audit A56 Prototype press-box sightline and occlusion checks](https://github.com/IanSzymanski/squidware/issues/56)
- [ ] [#61 · Audit A61 Publish immutable hosted releases with personal QR links and privacy controls](https://github.com/IanSzymanski/squidware/issues/61)
- [ ] [#62 · Audit A62 Show performer-specific revision changes and retain prior releases](https://github.com/IanSzymanski/squidware/issues/62)
- [ ] [#63 · Audit A63 Investigate optional staff follow-me and release-update synchronization](https://github.com/IanSzymanski/squidware/issues/63)
- [ ] [#87 · Roadmap Investigate and implement documented interchange for user-provided drill data](https://github.com/IanSzymanski/squidware/issues/87)

## v1.2 — Optional collaboration and scripting

Versioned scripting and optional cloud roles, lifecycle, sync, conflict recovery and collaborative review, preserving local/offline use.

0/4 implementation issues completed at reconciliation.

- [ ] [#48 · Audit A47 Expose a versioned scripting API over the engine and command layer](https://github.com/IanSzymanski/squidware/issues/48)
- [ ] [#88 · Roadmap Define optional collaboration roles, privacy and service lifecycle](https://github.com/IanSzymanski/squidware/issues/88)
- [ ] [#89 · Roadmap Add optional project sync, named versions and explicit conflict recovery](https://github.com/IanSzymanski/squidware/issues/89)
- [ ] [#90 · Roadmap Add shared review comments and concurrent editing after merge semantics are proven](https://github.com/IanSzymanski/squidware/issues/90)

Tracker #1 spans all releases and belongs to the last milestone; it closes only after every child issue is fulfilled. New scope must be assigned in the plan before a release can publish. No issue is closed merely by assigning a milestone.

## Publication

The release coordinator creates/synchronizes milestones and reconciles issue ranks. It considers only the first unpublished release, requires every planned issue to be closed as completed and no open milestone items, and requires successful CI on the exact source commit. It then builds and verifies Windows, macOS and Linux packages. Only successful builds can create a version commit/tag and publish a GitHub release with packages, checksums and issue-based notes. Existing published releases and tags are never overwritten. Pre-1.0 releases are marked prerelease. Release commits record the packaged version; normal development remains on main.

Publication is rechecked against live issue state immediately before it becomes public. A failure keeps the release unpublished. Scheduled reconciliation retries interrupted work without treating cancelled/not-planned issues as fulfilled. Hardware and writer checks in #3/#64 and signing requirements in #72 must actually be fulfilled before v1.0; automation cannot substitute for them.
