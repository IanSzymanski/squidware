# Low-poly 3D assets

In the editor, set a section's default under **Production settings → Ensemble sections**. Use **Cast → Appearance → 3D equipment** to inherit that default, choose an override, or suppress the equipment model. A flag can also have its own fabric color. An explicit legacy role controls the fallback when an inherited asset belongs to the other role. Unknown equipment IDs retain a generic marker and can be replaced in Cast. Section names have no effect on equipment.

The inline and pop-out previews use the same renderer. **Detailed** displays modeled equipment and shadows. **Lightweight** uses the existing role and performer markers. **Stadium** is a view-local toggle for the stands and press box. Selecting performers, zooming and using the standard camera presets still work with the stadium visible. Equipment and stadium geometry are visual. Performer positions, field markings, and drill clearance calculations are independent of these meshes.

The [asset preview](../../../examples/README.md#low-poly-3d-asset-preview) also includes a stationary front-ensemble fixture alongside a moving cast. The fixture demonstrates the models and their placement contract. Independent project placements, visibility and undo for front-ensemble objects depend on [the staging editor in #81](https://github.com/IanSzymanski/squidware/issues/81), which is also a prerequisite for [#93](https://github.com/IanSzymanski/squidware/issues/93).

## Inventory and attachment points

All geometry is original procedural work built from shared boxes and eight-sided cylinders or flares. The models ship under the repository's [MIT license](../../../LICENSE). They require no external files or network calls.

The model origin is on the ground at the performer or equipment center. Geometry is in field yards. +X goes right, +Y goes up, and +Z goes forward. The equipment root rotates around +Y using the same authored facing sample as the performer body. Arms and visible grips are simple carry references. A flag uses the pole grip at `[0.34, 1.04, 0.22]` in the performer frame. The pole is vertical in the carry pose, and the fabric extends in +X. Drums attach to a neutral chest carrier. These points can anchor later visual cues while leaving the marcher root in place.

| Catalog | Models and identifying details |
| --- | --- |
| Brass | Trumpet and mellophone use a compact forward bell with different flare widths. Trombone has an extended slide. Euphonium and tuba have upright flares and different tubing silhouettes. |
| Winds | Flute lies across the performer. Clarinet angles down from the face. Saxophone has a bent brass body and an upturned bell. |
| Marching percussion | Snare has one shallow drum, tenors use four shallow shells, and bass drum uses a side-facing shell on a carrier. |
| Color guard | A two-sided fabric flag on a pole, a solid stylized practice-rifle silhouette, and a stylized saber in a diagonal carry pose. |
| Front ensemble | Marimba, vibraphone, xylophone/glockenspiel, timpani, percussion rack, and keyboard/synth. |
| Stadium | Three low seating rows, a press box and short end-zone borders. The home-side stands leave the center of the sideline clear. All parts are outside the playable field. |

Aliases include `soprano` for trumpet, `baritone` for euphonium, `sousaphone` for tuba, `piccolo` for flute, `sax` for saxophone, `tenor` and `quads` for tenors, `bass` for bass drum, `rifle` for practice rifle, and `saber` and `sabre` for guard saber. The canonical IDs are defined in [the equipment catalog](../../../src/equipment.ts).

| Front-ensemble model | Approximate visual bounds, width × depth × height in yd |
| --- | --- |
| Marimba | 2.0 × 0.7 × 1.0 |
| Vibraphone | 1.7 × 0.6 × 1.0 |
| Xylophone/glockenspiel | 1.3 × 0.5 × 1.0 |
| Timpani pair | 1.8 × 0.9 × 0.9 |
| Percussion rack | 1.6 × 0.6 × 1.4 |
| Keyboard/synth | 1.5 × 0.6 × 1.1 |

These are visual bounds. Authored footprints are a separate staging control and can differ from the size of the mesh.

## Rendered review

- [Marching instruments](instruments.webp), [color guard equipment](guard.webp) and [front ensemble](pit.webp) show the models at consistent performer or equipment scale from the front, side and press-box angles. The home camera reads bell width and fabric color. The side angles best distinguish the brass projection and drum profiles. The press-box view shows the posture and instrument silhouettes within the larger rehearsal composition.
- [Marker-only view](desktop-markers.webp) and [full 3D view](desktop-full.webp) use the 500-performer scene at 1366 × 768. [Stadium camera review](stadium.webp) compares front, side, overhead and press-box views. The stands stay outside the field bounds and the overhead view retains the playable field.
- [Cast editing](editor-cast.webp), [compact light](compact-light.webp) and [compact high contrast](compact-high-contrast.webp) illustrate shared controls and focus. The browser replay switched the stadium with Space at 670 px width and 18 px root text. The field retains its normal area in the editor because the stadium option shares the existing 3D quality controls.

This addresses [design guidance §§1–4](../../DESIGN_GUIDANCE.md) through the shared field, native selectors, theme styles, tooltips and keyboard inputs. The settings are explicit and undoable when they belong to a project. Seeking from 3.5 to 6.5 and back restored the same render, including the stationary pit and performer attachments, in the review scene. The native v14 codec tests cover reload and invalid replacement. The browser replay switched the section default and the performer override through the editor controls and exercised undo/redo.

## Software measurements

The browser replay uses a 1366 × 768 viewport, 1× playback, the press-box view and the same lighting in all benchmark modes. Each timing window covers about 3.5 seconds. The draw calls and resident geometry counts come from the renderer. Shared mesh buffers remain cached until the view is closed. Two close/reopen cycles lost the old WebGL contexts and restored the same draw calls and triangles with a stable fresh geometry count. The Linux host exposed three AMD EPYC 9V74 vCPUs with a two-CPU cgroup quota. Chromium 154 used ANGLE with SwiftShader. These timings describe this software host only.

To reproduce, run `pnpm dev`, then `node scripts/3d-assets-browser-qa.cjs` from the repository root with Playwright available. Set `SQUIDWARE_CHROMIUM` to use a local Chromium binary. Results and raw PNG captures are written to `.qa/3d-assets`.

| Cast | Scene | Draw calls | Triangles | Resident geometries | Samples | Median frame | p95 frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | Markers | 14 | 20,276 | 16 | 36 | 100.0 ms | 200.0 ms |
| 64 | Carried equipment | 16 | 32,428 | 16 | 33 | 116.7 ms | 200.0 ms |
| 64 | Stadium | 15 | 20,444 | 16 | 31 | 100.0 ms | 249.9 ms |
| 64 | Equipment, stadium and pit | 20 | 35,452 | 16 | 31 | 116.6 ms | 233.3 ms |
| 500 | Markers | 14 | 158,052 | 16 | 20 | 200.0 ms | 416.6 ms |
| 500 | Carried equipment | 16 | 251,656 | 16 | 16 | 250.0 ms | 533.3 ms |
| 500 | Stadium | 15 | 158,220 | 16 | 16 | 216.6 ms | 633.4 ms |
| 500 | Equipment, stadium and pit | 20 | 254,680 | 16 | 16 | 283.2 ms | 350.0 ms |

The [raw browser report](browser-report.json) records the full inventory, measurements and interaction results.
