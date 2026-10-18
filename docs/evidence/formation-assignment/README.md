# Formation assignment review evidence

For [#26](https://github.com/IanSzymanski/squidware/issues/26). [Validation and measured layouts](validation.json) identify the native source/build/run and passing assignment/editor owners. Screenshots were visually inspected. The existing accessibility owner also passes on this application implementation; final source/contracts/native and hosted three-platform results are linked in the implementation PR.

Design guidance §§1–5 applies. The change reuses the Inspector, shared select and numeric controls, preview/acceptance commands, field paths, selection IDs and named undo. No project schema or physical-coordinate convention changes. The field remains 485px high at 1366×768 and 1120×768 at default scale, before and during preview. At 125% zoom it remains equal to the same layout without preview: 415.25 physical pixels at 1366px and 381.75 at 1120px. Existing toolbar/transport wrapping accounts for the enlarged narrow layout; the default-scale target is preserved. Assignment, travel and Apply/Cancel remain reachable. No new theme is introduced; #43 and physical writer/device qualification #64/#3 retain their scope.

The four reversed performers produce six crossing pairs with roster assignment and zero with positional assignment in the source fixture. Native rendered paths and total/longest travel agree with known destinations: positional 21.86/5.83 yd; roster 75.51/27.46 yd. This is a bounded comparison, with no claim of global optimization. Native mode changes, rotation continuity, cancel, one accepted history entry, undo/redo and actual save/reopen preserve performer metadata, unrelated dots and other sets.

- [Prior formation UI with roster-only assignment](../formation-previews/formation-line.png)
- [Before opening a preview](assignment-before.png)
- [Positional order and travel](assignment-positional.png)
- [Roster order and crossing paths](assignment-roster.png)
- [1366×768](assignment-1366-1.png)
- [1366px at 125% zoom](assignment-1366-1.25.png)
- [1120×768](assignment-1120-1.png)
- [1120px at 125% zoom](assignment-1120-1.25.png)
- [Travel remains reachable at enlarged narrow size](assignment-travel-enlarged.png)
