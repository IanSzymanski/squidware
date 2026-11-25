# Staging props review

The replay used Linux x64, Chromium 154 with ANGLE and SwiftShader, and a 3-set fixture with two performers and two props. It exercised the production build at 1366 × 768. The default-scale field measured 513 px high before placement. The enlarged review used 940 × 650 at 150% UI scale.

## Editor and field

- The Props command uses the existing field toolbar and command palette. The modal uses shared controls and focus behavior. The footprint preview accepts pointer placement, and the numeric center fields provide the keyboard equivalent. [Field before placement](before.webp) · [Placement draft](placement.webp)
- The replay selected a performer, edited a prop and verified that the performer selection persisted. It rejected inverted timing, canceled removal, undid and redid visibility, and restored a removed prop with Undo. Save and reopen preserved both prop IDs and their poses. [Light theme](light.webp) · [Enlarged high contrast](high-contrast-150.webp)
- One prop held at X 30 until count 4, crossed X 40 while turning 45° at count 8, reached X 50 and 90° by count 12 and disappeared at count 16. The second prop held its pose. The 2D and overhead 3D views used the same samples. [Split review at count 8](split-review.webp) · [Arrival](arrival.webp)

Live playback advanced through fractional prop poses. SVG charts included visible props and followed each set’s visibility. The Linux Electron field toolbar, split transition and native PDF suites passed.

## Rehearsal video

The Lightweight export produced 61 VP8 frames at 854 × 480 and 15 fps. FFmpeg decoded the opening, midpoint and arrival. The moving prop's pixel centroid shifted 38 px to the right at the midpoint, then its footprint disappeared. The stationary prop's centroid varied by less than 0.2 px across the three frames. [Decoded frames](video-frames.webp) · [Pixel measurements](video-review.json)

The rectangles and boxes depict authored planning dimensions. Physical clearance is tracked in [issue #84](https://github.com/IanSzymanski/squidware/issues/84).

To reproduce, serve the production build on port 4173 with `pnpm preview`, then run `node scripts/staging-browser-qa.cjs` with Playwright, Chromium and FFmpeg available. Set `SQUIDWARE_CHROMIUM` to use a system Chromium installation.
