# Appearance evidence — issue #43

Captured in the real sandboxed Electron renderer on Linux. The new [themes QA suite](../../../scripts/themes-qa.mjs) uses native pointer/keyboard input and isolated profiles. `results-write.json` and `results-restart.json` record 37 audits with 6,313 text checks, including disabled controls and placeholders, and no 4.5:1 contrast failures. They also record native selection, project save/reopen, preserved colors/history/coordinates and appearance persistence in a fresh process.

`implementation-source.json` identifies the built implementation used by this run. Evidence/documentation are added after the run. The existing desktop regression results are summarized in `regressions.json`.

- [Before: main 430444f, 1366 × 768](before.png), built from an untouched temporary source snapshot.
- After at 1366 × 768: [dark](themes-dark-field.png), [light](themes-light-field.png), [high contrast](themes-high-contrast-field.png). The same legacy lime Brass color is retained; B1 shows separate circular selection and square keyboard-focus cues. Field height is **485 px** in every theme.
- [Theme and scale preferences](themes-light-preferences.png).
- [1000 × 700 at 125%](themes-dark-1000-125.png), with contextual field hints and wrapping primary actions.
- [850 × 650 at 150%](themes-high-contrast-850-150.png), with collapsed pane access and a scrolling workspace; Save/Export/Menu remain accessible.
- [Real transition warnings in light mode](themes-light-warnings.png). `warnings-results.json` also records dark and high-contrast warning audits.

Supplementary native PDF inspection generated the same six-page demo packet in dark/100%, light/125% and high-contrast/150%. `pdf-invariance.json` records identical extracted text, character boxes, page dimensions and decoded drawing streams across all three exports. Existing print media rules remain unchanged; print resets the chrome scale.

Guidance sections 1–5 apply; see [behavior/design notes](../../APPEARANCE.md). Screenshots were inspected alongside interaction, persistence and computed-style evidence. These results do not replace Windows/macOS CI, writer/assistive-technology checks (#64) or representative school-hardware qualification (#3).
