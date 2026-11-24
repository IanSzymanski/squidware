# Saved cameras and rehearsal video

The Chromium replay uses a two-performer project with known positions, a synthesized local WAV, and software WebGL. It saves a camera after zooming, undoes and redoes the save, reopens the v17 file, and restores the view. The two 854 × 480 exports each contain 31 VP8 frames at 15 fps. Decoded marker positions in the opening, midpoint, and final frames agree with the saved camera’s projection of the expected drill positions within four pixels per performer.

The default export contains only the video track. With recording inclusion enabled, the export adds an Opus track. Its first packet starts at 0.244 seconds for a configured 0.250-second delay. Both clips identify the production and a revision derived from the project contents. The replay also checks cancel, missing WebGL, unsupported encoding settings, and the two-minute limit.

Run the replay against a production preview with Playwright, Chromium, FFmpeg, and ffprobe installed.

```sh
pnpm build
pnpm preview --port 4173 --strictPort
# In a second shell, from the repository root:
SQUIDWARE_CHROMIUM=/usr/bin/chromium node scripts/rehearsal-video-browser-qa.cjs
```

## Visual review

The camera entry point sits with the existing Review camera and rendering controls. The two dialogs use the shared modal layout and controls. At 980 × 680 in High contrast with 150% UI scale, the dialog scrolls to keep its controls and primary action reachable. Escape dismisses the dialog when idle and cancels an active render.

| Capture | View |
| --- | --- |
| [Review workspace](review.webp) | 1366 × 768, before opening Saved views |
| [Saved views](saved-views.webp) | Named angle with visible keyboard focus |
| [Video settings](export-options.webp) | Recording enabled and its sharing notice visible |
| [Compact video settings](export-compact.webp) | 980 × 680 at 150% UI scale, High contrast |
| [Exported frame](output-frame.webp) | Count 2 in the detailed video |
