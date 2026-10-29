# README screenshots

Captured 2026-10-29 from the production desktop app at source commit `14454e15484c64ef5bc141ba54b79969dceaf5db` (merged main after #155). These images show development features; the root README distinguishes them from the published v0.6.0 prerelease.

All captures use an isolated profile, the included Tidal forces demo, dark theme, default UI scale and a 1600 × 1000 content viewport. No application styles or displayed UI content were replaced. [Capture metadata and image hashes](captures.json) record source, dimensions, view and WebGL draw counts.

| Image | State |
| --- | --- |
| [studio.png](studio.png) | Set 2, Tidal arc; Brass selected; Write layout with compact set list and contextual Inspector. |
| [production-sheet.png](production-sheet.png) | Editable Sheet workspace with six demo sets, counts, tempos, notes and measure/beat positions. |
| [rehearsal-3d.png](rehearsal-3d.png) | Set 3, Orbital motion; Rehearse layout, perspective camera and detailed shadows. The real Three.js scene was rendered using SwiftShader. |
| [portable-audio.png](portable-audio.png) | Export → Portable production with audio; generated 80-second PCM recording and a two-second offset. Captured directly around the native renderer's dialog bounds with a 24 px margin for readability. No private audio was used or committed. |

The screenshots are product illustrations, not additional functional or hardware certification. Desktop workflow acceptance remains in the owning suites documented in [the testing guide](../TESTING.md).
