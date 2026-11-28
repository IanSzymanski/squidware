# README screenshots

Captured 2026-11-26 from the production desktop app built at source commit `96b23f9eae346c4d515ea28f743b0c166e619a40`, on the branch that rebuilds the application shell and design system. These images show development features; the root README distinguishes them from the published v0.6.0 prerelease.

All captures use an isolated profile, the included Tether demo (165 performers, 67 sets), dark theme, default UI scale and a 1600 × 1000 content viewport. The production main process, preload and renderer run under Xvfb on Linux. No application styles or displayed UI content were replaced. Each capture waits for the whole-show check to finish, so the problems count in the top bar is the real result. [Capture metadata and image hashes](captures.json) record source/build identity, viewport dimensions, crops, mode, view and cumulative WebGL draw counts. The capture run reported no renderer errors.

[studio.png](studio.png), [shape-preview.png](shape-preview.png) and [travel-path.png](travel-path.png) were recaptured on 2026-11-28 from the production desktop app built at source commit `1dc1ba83d357eaa983c83d557c78b812c90b06cf`, after the drill-writer review rounds changed those screens. Same profile, demo, theme and viewport; the Chromium sandbox was disabled for the Linux container the app ran in. [Capture metadata](captures.json) records that build under `refresh`; the other images keep the 2026-11-26 capture.

| Image | State |
| --- | --- |
| [studio.png](studio.png) | Set 3, EH 3 · Accretion disc; 24 Sopranos selected from the side panel; the selection frame fits the group and the Inspector names S1, the offstage soloist, as standing apart. |
| [shape-preview.png](shape-preview.png) | The same set with the Sopranos previewed as an arc: 23 performers in Cast order at a 2-step interval, 28.5 × 14 steps, centered on the 40; S1 stays in place with an Include option. The preview was canceled after capture. |
| [production-sheet.png](production-sheet.png) | Plan mode: the editable production sheet showing the opening rows of the 67-set demo with notes, counts, base tempos, meters and rehearsal marks. |
| [rehearsal-3d.png](rehearsal-3d.png) | Set 3, EH 3 · Accretion disc; Rehearse mode, press-box camera, stadium and detailed shadows. The real Three.js scene was rendered using SwiftShader. |
| [travel-path.png](travel-path.png) | Set 9, EH 9 · Lament; S16 selected; Edit performer path with a curved preview at the dialog's 2× field zoom, handles at (60, 21) and (69, 15.5) yards, the count scrubber at count 11. The draft was canceled after capture. Cropped around the dialog with a 24 px margin. |
| [portable-audio.png](portable-audio.png) | Export → Portable production with audio; generated 80-second PCM recording and a two-second offset. Cropped around the dialog with a 24 px margin. No private audio was used or committed. |

The screenshots are product illustrations, not additional functional or hardware certification. Desktop workflow acceptance remains in the owning suites documented in [the testing guide](../TESTING.md).
