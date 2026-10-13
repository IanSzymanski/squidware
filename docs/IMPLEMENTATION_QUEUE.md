# Squidware implementation queue

Started October 12, 2026. This queue follows the direct prerequisites in the live GitHub audit issues. Within ready work, prefer the foundation issues and then P1, P2, and P3 work. Numbers are GitHub issue numbers; this is an implementation order, not a release schedule.

The first batch covers licensing (#2, MIT selected by the maintainer for broad reuse), reproducible performance tooling (#3), editor state and commands (#4), and canonical editor limits (#8). #8 can run alongside the other foundations because it has no blocking prerequisite. The next data-model change is #5, followed by named undo transactions (#6) and asynchronous recovery (#7). Keep the v1 format and existing workflows intact until #5 supplies tested migration.

#3 remains open until a representative school laptop has production Electron measurements and traces. Local development-machine measurements are evidence for this machine only. #64 requires actual participant sessions and supported-platform walkthroughs. These external checks should run alongside implementation; they must not be reported as completed by source review or synthetic fixtures.

Issues are completed only when their individual definitions of done are met. A draft PR, passing unit tests, or a partial implementation does not by itself close an issue. Changes land through reviewable branches, and the parent tracker (#1) stays open.

| Order | Issue | Direct prerequisites |
| --- | --- | --- |
| 1 | [#2 · Choose and publish the repository's open-source license](https://github.com/IanSzymanski/squidware/issues/2) | None |
| 2 | [#3 · Establish maximum-size performance baselines and budgets](https://github.com/IanSzymanski/squidware/issues/3) | None |
| 3 | [#4 · Extract the editor store and central command registry from App.tsx](https://github.com/IanSzymanski/squidware/issues/4) | None |
| 4 | [#5 · Introduce schema v2 with separate sets and moves plus v1 migration](https://github.com/IanSzymanski/squidware/issues/5) | None |
| 5 | [#8 · Drive all editor limits from PROJECT_LIMITS](https://github.com/IanSzymanski/squidware/issues/8) | None |
| 6 | [#6 · Replace snapshot undo with named transactions and coalesced edits](https://github.com/IanSzymanski/squidware/issues/6) | #4 |
| 7 | [#7 · Move recovery to asynchronous main-process storage](https://github.com/IanSzymanski/squidware/issues/7) | #4, #6 |
| 8 | [#9 · Run incremental collision analysis in a Web Worker with broad-phase filtering](https://github.com/IanSzymanski/squidware/issues/9) | #3, #4 |
| 9 | [#10 · Limit thumbnail rerenders and use constant-time selection membership](https://github.com/IanSzymanski/squidware/issues/10) | #3 |
| 10 | [#11 · Isolate playback subscriptions and memoize the static 2D field](https://github.com/IanSzymanski/squidware/issues/11) | #4, #3 |
| 11 | [#13 · Use the attached audio track as the playback clock](https://github.com/IanSzymanski/squidware/issues/13) | #4 |
| 12 | [#14 · Schedule a meter-aware metronome on the audio clock](https://github.com/IanSzymanski/squidware/issues/14) | #4, #13 |
| 13 | [#15 · Make 3D rendering demand-driven and preserve the WebGL renderer](https://github.com/IanSzymanski/squidware/issues/15) | #3 |
| 14 | [#16 · Reclaim field space with compact editor chrome](https://github.com/IanSzymanski/squidware/issues/16) | None |
| 15 | [#17 · Add a compact set list with drag reorder and jump-to-set](https://github.com/IanSzymanski/squidware/issues/17) | #4, #5 |
| 16 | [#18 · Expose context-sensitive selection actions and Inspector sections](https://github.com/IanSzymanski/squidware/issues/18) | #4, #16 |
| 17 | [#19 · Show live cursor coordinates and performer hover details](https://github.com/IanSzymanski/squidware/issues/19) | None |
| 18 | [#20 · Fix dense-formation hit testing and label readability](https://github.com/IanSzymanski/squidware/issues/20) | None |
| 19 | [#21 · Support configurable grids and explicit group snapping modes](https://github.com/IanSzymanski/squidware/issues/21) | #4 |
| 20 | [#22 · Parse drill-language coordinates and support exact group moves](https://github.com/IanSzymanski/squidware/issues/22) | #4, #21 |
| 21 | [#23 · Make between-set preview mode explicit and offer direct editing recovery](https://github.com/IanSzymanski/squidware/issues/23) | #4 |
| 22 | [#25 · Preview formations with direct field handles and safe application](https://github.com/IanSzymanski/squidware/issues/25) | #4, #18 |
| 23 | [#26 · Preserve positional order when assigning performers to formations](https://github.com/IanSzymanski/squidware/issues/26) | #25 |
| 24 | [#27 · Add exact rotate, scale, mirror and pivot transforms](https://github.com/IanSzymanski/squidware/issues/27) | #4, #18 |
| 25 | [#28 · Make the production sheet editable with spreadsheet paste](https://github.com/IanSzymanski/squidware/issues/28) | #4, #8 |
| 26 | [#29 · Give add, duplicate, hold and insert-before sets distinct behavior](https://github.com/IanSzymanski/squidware/issues/29) | #4, #5 |
| 27 | [#30 · Show previous and next set ghosts with neighboring paths](https://github.com/IanSzymanski/squidware/issues/30) | None |
| 28 | [#31 · Add timeline zoom, set-aware labels and one-count stepping](https://github.com/IanSzymanski/squidware/issues/31) | #4 |
| 29 | [#32 · Make Cast a panel with shared field selection](https://github.com/IanSzymanski/squidware/issues/32) | #4, #6 |
| 30 | [#34 · Make coordinate output precision and move descriptions configurable](https://github.com/IanSzymanski/squidware/issues/34) | #5 |
| 31 | [#36 · Standardize action labels, icons and redundant entry points](https://github.com/IanSzymanski/squidware/issues/36) | None |
| 32 | [#37 · Fix field keyboard navigation, text sizes and contrast](https://github.com/IanSzymanski/squidware/issues/37) | #16 |
| 33 | [#38 · Separate explicit file-save status from recovery and draft status](https://github.com/IanSzymanski/squidware/issues/38) | #4, #6 |
| 34 | [#39 · Add versioned personal preferences separate from project files](https://github.com/IanSzymanski/squidware/issues/39) | #4 |
| 35 | [#64 · Validate audit priorities with drill writers and supported-platform walkthroughs](https://github.com/IanSzymanski/squidware/issues/64) | #3 |
| 36 | [#67 · Unify nudge behavior and make edit increments configurable](https://github.com/IanSzymanski/squidware/issues/67) | #4, #21, #37, #39 |
| 37 | [#12 · Render dynamic performer layers on canvas during playback and dragging](https://github.com/IanSzymanski/squidware/issues/12) | #3, #11 |
| 38 | [#24 · Split a transition at a selected count into a new set](https://github.com/IanSzymanski/squidware/issues/24) | #4, #5 |
| 39 | [#33 · Add additive section selection, lasso, rank/file selection and saved groups](https://github.com/IanSzymanski/squidware/issues/33) | #4, #32 |
| 40 | [#35 · Improve rehearsal print layouts, paths and performer highlighting](https://github.com/IanSzymanski/squidware/issues/35) | #34 |
| 41 | [#40 · Add resizable panels, workspace presets and focus mode](https://github.com/IanSzymanski/squidware/issues/40) | #16, #39 |
| 42 | [#41 · Support simultaneous editable 2D and live 3D review](https://github.com/IanSzymanski/squidware/issues/41) | #4, #15, #40 |
| 43 | [#42 · Add field display preferences and reversible orientation](https://github.com/IanSzymanski/squidware/issues/42) | #20, #39 |
| 44 | [#43 · Introduce neutral dark/light themes, UI scaling and high contrast](https://github.com/IanSzymanski/squidware/issues/43) | #37, #39 |
| 45 | [#44 · Store per-section and per-direction analysis rules in the project](https://github.com/IanSzymanski/squidware/issues/44) | #5, #9 |
| 46 | [#45 · Add show-wide problems with count navigation and live field overlays](https://github.com/IanSzymanski/squidware/issues/45) | #9, #31, #44 |
| 47 | [#46 · Add reusable and shareable show templates and formation libraries](https://github.com/IanSzymanski/squidware/issues/46) | #5, #25, #26, #39 |
| 48 | [#47 · Publish the versioned .squid format and compatibility fixtures](https://github.com/IanSzymanski/squidware/issues/47) | #5 |
| 49 | [#49 · Persist live formation objects that remain editable after application](https://github.com/IanSzymanski/squidware/issues/49) | #5, #25, #26 |
| 50 | [#51 · Add measures, meter, rehearsal marks and pickup counts](https://github.com/IanSzymanski/squidware/issues/51) | #5, #28, #31 |
| 51 | [#52 · Support tempo changes, ramps and fermatas within a move](https://github.com/IanSzymanski/squidware/issues/52) | #5, #13, #14, #51 |
| 52 | [#53 · Align the tempo map to audio using per-set/count anchors](https://github.com/IanSzymanski/squidware/issues/53) | #13, #51, #52 |
| 53 | [#57 · Build a read-only performer viewer using the shared engine](https://github.com/IanSzymanski/squidware/issues/57) | #5, #47, #34 |
| 54 | [#58 · Export a self-contained offline performer viewer from desktop](https://github.com/IanSzymanski/squidware/issues/58) | #57 |
| 55 | [#59 · Generate a geometry-backed 'my next move' card](https://github.com/IanSzymanski/squidware/issues/59) | #57, #34 |
| 56 | [#60 · Add sunlight mode, large rehearsal controls and offline PWA behavior](https://github.com/IanSzymanski/squidware/issues/60) | #57, #14 |
| 57 | [#61 · Publish immutable hosted releases with personal QR links and privacy controls](https://github.com/IanSzymanski/squidware/issues/61) | #57, #60, #35 |
| 58 | [#62 · Show performer-specific revision changes and retain prior releases](https://github.com/IanSzymanski/squidware/issues/62) | #61 |
| 59 | [#65 · Add a drill-aware command palette and rebindable shortcuts](https://github.com/IanSzymanski/squidware/issues/65) | #4, #22, #27, #39 |
| 60 | [#66 · Build accessible, state-aware tooltips from command metadata](https://github.com/IanSzymanski/squidware/issues/66) | #4, #65 |
| 61 | [#48 · Expose a versioned scripting API over the engine and command layer](https://github.com/IanSzymanski/squidware/issues/48) | #2, #4, #5, #47 |
| 62 | [#50 · Model follow-the-leader and counter-march as explicit move types](https://github.com/IanSzymanski/squidware/issues/50) | #5, #49, #9 |
| 63 | [#54 · Add an exploratory sound-delay and ensemble-spread map](https://github.com/IanSzymanski/squidware/issues/54) | #45 |
| 64 | [#55 · Add form-quality metrics for intervals, lines and arcs](https://github.com/IanSzymanski/squidware/issues/55) | #45, #49 |
| 65 | [#56 · Prototype press-box sightline and occlusion checks](https://github.com/IanSzymanski/squidware/issues/56) | #15, #45 |
| 66 | [#63 · Investigate optional staff follow-me and release-update synchronization](https://github.com/IanSzymanski/squidware/issues/63) | #61, #62 |

Revisit this queue when issue dependencies change, platform verification finds regressions, or drill-writer sessions establish different priorities. Related changes may share a PR, but their acceptance criteria and remaining work remain separate.
