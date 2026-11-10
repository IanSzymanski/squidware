# README screenshots

Captured 2026-11-10 from the production desktop app built at source commit `e279177522dfec0826816e92e4971fbc11bb36dc` (branch synced with main through #186), before the final documentation edits. These images show development features; the root README distinguishes them from the published v0.6.0 prerelease.

All captures use an isolated profile, the included Tether demo (165 performers, 67 sets), dark theme, default UI scale and a 1600 × 1000 content viewport. The production main process, preload and renderer run under Xvfb on Linux. No application styles or displayed UI content were replaced. [Capture metadata and image hashes](captures.json) record source/build identity, viewport dimensions, crops, view and cumulative WebGL draw counts. The capture run reported no renderer errors.

| Image | State |
| --- | --- |
| [studio.png](studio.png) | Set 3, EH 3 · Accretion disc; 24 Sopranos selected; Write layout with compact set list and contextual Inspector. |
| [production-sheet.png](production-sheet.png) | Editable Sheet workspace showing the opening rows of the 67-set demo, multiline notes, base tempos, meters and rehearsal marks. |
| [rehearsal-3d.png](rehearsal-3d.png) | Set 3, EH 3 · Accretion disc; Rehearse layout, perspective camera and detailed shadows. The real Three.js scene was rendered using SwiftShader. |
| [travel-path.png](travel-path.png) | Set 9, EH 9 · Lament; S16 selected; Edit performer path, cubic Bézier preview at 2× field zoom. Controls are (64.66, 35.75) and (69.95, 14.48) yards, with the default count-11 preview. The draft was canceled after capture. Cropped around the renderer's dialog with a 24 px margin, bounded by the viewport. |
| [portable-audio.png](portable-audio.png) | Export → Portable production with audio; generated 80-second PCM recording excerpt and a two-second offset. Captured directly around the native renderer's dialog bounds with a 24 px margin for readability. No private audio was used or committed. |

The screenshots are product illustrations, not additional functional or hardware certification. Desktop workflow acceptance remains in the owning suites documented in [the testing guide](../TESTING.md).
