# README screenshots

Captured 2026-11-10 from the production desktop app built at source commit `329917506d42d89a0771f66665bd12a96b1f10e1` (merged main after #172), before this documentation refresh. These images show development features; the root README distinguishes them from the published v0.6.0 prerelease.

All captures use an isolated profile, the included Tidal forces demo, dark theme, default UI scale and a 1600 × 1000 content viewport. The production main process, preload and renderer run under Xvfb on Linux. No application styles or displayed UI content were replaced. [Capture metadata and image hashes](captures.json) record source/build identity, viewport dimensions, crops, view and cumulative WebGL draw counts. The capture run reported no renderer errors.

| Image | State |
| --- | --- |
| [studio.png](studio.png) | Set 2, Tidal arc; Brass selected; Write layout with compact set list and contextual Inspector. |
| [production-sheet.png](production-sheet.png) | Editable Sheet workspace with six demo sets, counts, tempos, notes and measure/beat positions. |
| [rehearsal-3d.png](rehearsal-3d.png) | Set 3, Orbital motion; Rehearse layout, perspective camera and detailed shadows. The real Three.js scene was rendered using SwiftShader. |
| [travel-path.png](travel-path.png) | Set 2, B10 selected; Edit performer path, cubic Bézier preview at 2× field zoom. Controls are (40.17, 12.67) and (50.34, 39.83) yards, with the default count-16 preview. The draft was canceled after capture. Cropped around the renderer's dialog with a 24 px margin, bounded by the viewport. |
| [portable-audio.png](portable-audio.png) | Export → Portable production with audio; generated 80-second PCM recording and a two-second offset. Captured directly around the native renderer's dialog bounds with a 24 px margin for readability. No private audio was used or committed. |

The screenshots are product illustrations, not additional functional or hardware certification. Desktop workflow acceptance remains in the owning suites documented in [the testing guide](../TESTING.md).
