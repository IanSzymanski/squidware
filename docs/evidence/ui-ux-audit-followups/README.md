# UI/UX audit follow-ups: before and after

Evidence for [#173](https://github.com/IanSzymanski/squidware/issues/173), [#175](https://github.com/IanSzymanski/squidware/issues/175) and [#174](https://github.com/IanSzymanski/squidware/issues/174), the first three issues from the [2026-11-05 UI/UX audit](../../audits/2026-11-05/UI_UX_AUDIT.md). "Before" images are the audit's own captures. "After" images were taken the same way, with Playwright against the Vite browser build of the Tidal forces demo at 1366 × 768, scale 1, dark theme unless named, and color-quantized for size.

These images illustrate the change. Acceptance rests on the unit tests and the 47 desktop suites; [PR #184](https://github.com/IanSzymanski/squidware/pull/184) records the local and Windows/macOS/Linux CI results.

## Measured at 1366 × 768

| | Before | After |
|---|---|---|
| Drawn playing surface | 696 × 372 px; about 323 px of contiguous height uncovered | 739 × 394 px; nothing covers it at idle |
| Places showing snap mode | Field strip, status bar, Inspector microcopy | Status bar only (the field status line in focus mode) |
| Untouched demo file status | Unsaved changes; New → Blank asks to discard | No changes; no question |
| Palette results visible | 3½ | 8 |
| Set names truncated (demo) | 4 of 6 at 1366 and 1920 px | None |

## Pairs

| Area | Before | After |
|---|---|---|
| Editor at 1366 × 768 | [home-1366](../../audits/2026-11-05/home-1366.png) | [home-1366](home-1366.png), [light](home-1366-light.png), [high contrast](home-1366-high-contrast.png) |
| Field keyboard help (after a key press only) | always drawn, see home-1366 above | [field-keyboard-1366](field-keyboard-1366.png) |
| Shape default for the 24 brass | [shape](../../audits/2026-11-05/shape.png): positional, 5 crossings | [shape](shape.png): fitted to the selection, shortest travel, 0 crossings |
| Shared routes coordinates | [shared-routes](../../audits/2026-11-05/shared-routes.png): 26.666666666666668 | [shared-routes](shared-routes.png): 26.667 |
| Move operations, unchanged draft | [move-ops](../../audits/2026-11-05/move-ops.png): "32 → 32", Apply looks enabled | [move-ops](move-ops.png): Apply visibly unavailable |
| Export | [export](../../audits/2026-11-05/export.png) | [export](export.png): PDF drill book and Other formats |
| Command palette | [palette](../../audits/2026-11-05/palette.png) | [palette](palette.png) |
| Production sheet | [sheet](../../audits/2026-11-05/sheet.png): "4/4:4", clipped notes | [sheet](sheet.png): "4/4", whole note lines, Add mark |
| Transport while playing | [playing](../../audits/2026-11-05/playing.png): "69.545 / 152" | [playing](playing.png): whole counts |
| 3D preview | [3d](../../audits/2026-11-05/3d.png) | [3d](3d.png) |
| Narrow window | [narrow](../../audits/2026-11-05/narrow.png) at 900 px | [narrow-1000](narrow-1000.png): snap status still shown |
| Preferences | one long scroll | [preferences](preferences.png): Appearance, Field display, Editing, Shortcuts |
| Layout popover | no active preset shown | [layout](layout.png): active preset outlined and checked |
| History, nothing to undo | Undo/Redo looked enabled | [history](history.png) |
| Replacing an edited production | native `window.confirm` | [confirm](confirm.png): in-app alert dialog, focus on Cancel |

Window-size and UI-scale breakpoints (the audit's scale.png) belong to [#178](https://github.com/IanSzymanski/squidware/issues/178) and are unchanged here.
