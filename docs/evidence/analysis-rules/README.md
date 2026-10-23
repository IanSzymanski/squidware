# Analysis rules review evidence

Baseline: production Electron built from main `b4a7bcd`, after PR #147. After: #44’s implementation, using the same two-performer, three-set fixture and Linux software host. One performer belongs to Brass and the other to Winds. Their straight paths remain 1.5 yd apart and travel 8 yd in 8 counts, giving known default and override outcomes.

- [Before](analysis-rules-before.png) / [Default workspace](analysis-rules-default.png): new Analysis rules entry and explicit direction-availability text; 485 px field height at 1366×768.
- [Draft editor](analysis-rules-editor-dark.png): section/direction inheritance, units and explicit backward declaration before Save.
- [Applied flags](analysis-rules-flags.png): a section spacing limit of 2 yd and a declared backward stride limit of 0.4 yd/count produce two expected flags without changing coordinates.
- [Light](analysis-rules-light.png), [High contrast](analysis-rules-high-contrast.png), [Enlarged](analysis-rules-enlarged.png).
- [Native workflow checks and measured viewports](results.json).

Agent inspection confirms shared colors/controls, readable threshold explanations, non-color invalid/unknown text and visible focus. The existing Inspector scrolls to the analysis content. The enlarged dialog scrolls, and native focus keeps Save reachable. The fixed-size workspace measurement is captured while hidden; behavior checks use a visible, settled native window, preserving the macOS work-area correction from #147.

The local production main/preload/renderer runs on an Xorg dummy display with temporary `--no-sandbox --disable-dev-shm-usage` flags. These flags are absent from the committed launcher and shipped app. Recorded source identities describe the tested working content before copying evidence; screenshots and documentation are added afterward. Local results do not certify other platforms, sandbox behavior, package installers, or hardware. Hosted certification runs the registered suite normally.
