# Split review verification

Review reuses the existing editing field, camera and demand-driven 3D renderer, workspaces, and shared playback clock. Both panes keep the same active set and selection. The preview mirrors a live pointer drag and an uncommitted coordinate change. Dragging the divider or switching from Split to 3D keeps the same WebGL canvas. Closing 3D releases the canvas and returns keyboard focus to the 2D toolbar button.

- [Design before split](before.webp) and [an edited point in Review](review-edit.webp) at 1366 × 768
- [Overhead camera](review-overhead.webp) at the same size
- [Stacked field and divider focus](review-stacked.webp) at 900 × 768 and 150% UI scale in high contrast
- [500 performers and 128 sets](review-maximum.webp) after a position edit and fractional playback
- [Usable 2D field when WebGL is unavailable](review-fallback.webp)

The layout gives more space to either pane through a keyboard-accessible divider. The 3D camera controls occupy their own row at small sizes. Pending production edits and selection stay in the editor store, and selecting a dot leaves project history untouched. Review starts in Lightweight quality and offers the existing Detailed setting in the 3D pane.

The [browser report](browser-report.json) records the replay in Chromium. From the repository root, build the app, start `pnpm preview --port 5193`, and run `node scripts/split-review-browser-qa.cjs` with Playwright and Chromium available. Set `SQUIDWARE_CHROMIUM` to use a system Chromium executable.
