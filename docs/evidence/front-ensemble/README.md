# Front ensemble palette review

Open the sideline example in Squidware and use **Saved views** to select **Pit front**, **Pit side** or **Pit press box**. Twelve brass performers move through three sets beside six stationary instruments. The props stay in the same place at every count. [Editable example](../../../format/examples/front-ensemble-v19.squid)

## Model inventory

All six models use original Squidware geometry and shared materials from the existing asset library. The models use the repository’s MIT license. The ground-level origin matches the center in the Props editor. Local +X points right, +Y points up, and +Z points toward the audience at 0°. Rotation uses the same heading as the 2D footprint. [Model source](../../../src/components/3d/assetModels.ts) · [License](../../../LICENSE)

Dimensions are width × depth × height in yards. Visual bounds measure the model’s axis-aligned extent in its default orientation. The planning dimensions are editable per set and start with enough room for the model. The 3D mesh keeps its scale. Physical clearance is tracked separately. [Default dimensions](../../../src/frontEnsemble.ts) · [Clearance issue #84](https://github.com/IanSzymanski/squidware/issues/84)

| Model | Visual bounds | Default planning dimensions |
| --- | --- | --- |
| Marimba | 1.95 × 0.722 × 0.99 | 2.25 × 1.10 × 1.05 |
| Vibraphone | 1.65 × 0.634 × 0.99 | 2.00 × 1.00 × 1.05 |
| Xylophone / glockenspiel | 1.22 × 0.514 × 0.99 | 1.50 × 0.85 × 1.05 |
| Timpani pair | 1.755 × 0.87 × 0.792 | 2.05 × 1.25 × 0.95 |
| Percussion rack | 1.55 × 0.602 × 1.365 | 1.90 × 1.00 × 1.45 |
| Keyboard / synth | 1.42 × 0.586 × 1.03 | 1.75 × 0.95 × 1.10 |

## Editor and rendered output

- The palette uses the existing Props modal, field preview, button styles and undo commands. The default 1366 × 768 viewport kept 513 px of field height. The chooser and Cancel stayed reachable at 940 × 650 and 150% UI scale in high contrast. [Before placement](before.webp) · [Palette](palette.webp) · [Enlarged high contrast](high-contrast-150.webp)
- The replay chose Marimba with the keyboard, added two copies, then resized the first copy’s planning footprint, rotated it and hid it at the second set. The second copy kept its pose. Undo and redo restored visibility. Save and reopen preserved the model keys, IDs and independent poses. [Per-set editing](pose.webp)
- At the midpoint, the authoring replay sampled a 45° turn while retaining the stationary copy’s transform. The sample project held all six prop transforms constant as the brass moved. The front, side and press-box views were inspected in the production renderer. [Three camera views](camera-views.webp) · [Studio at count 8](sample.webp) · [Close-up contact sheet](../3d-assets/pit.webp)

## Render cost

The Chromium 154 replay ran on Linux x64 using ANGLE and SwiftShader. At count 8 in Lightweight quality, the 12-performer sample submitted six indexed instanced draws without props and nine with all six props. Equipment added 143 primitive instances and 8,568 index references across those three draws. The scene shares box, cylinder and flare resources with the other 3D assets. The renderer releases buffers, materials and geometries when the view closes. [Draw counts](review.json)

To reproduce, run `pnpm build` and serve the production build on port 4173 with `pnpm preview`. Run `node scripts/front-ensemble-browser-qa.cjs` with Playwright and Chromium available. Set `SQUIDWARE_CHROMIUM` to use a system Chromium installation.
