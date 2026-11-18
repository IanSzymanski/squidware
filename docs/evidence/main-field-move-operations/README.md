# Move operations on the main field

[Issue #179](https://github.com/IanSzymanski/squidware/issues/179) completes the port of the four named spatial editors to the main field. [Previous Move operations modal](../path-operations/operations-resize.png) shows the inset field at 1366 × 768.

| View | Current capture |
| --- | --- |
| Resize at 1366 × 768 | [Dark](resize.webp) · [Light](light.webp) · [High contrast](high-contrast.webp) |
| Other operations at 1366 × 768 | [Reverse](reverse.webp) · [Copy](copy.webp) · [Paste](paste.webp) · [Invalid counts](invalid.webp) |
| 1024 × 720 at 150% UI scale | [Flipped field with Inspector temporarily restored](enlarged.webp) |

## Design review

- §1. The main field measures 481 px high at 1366 × 768. It measures 513 px before opening the editor. The two 16 px timeline rows account for the difference. The Inspector keeps Apply and Cancel above the scrollable form.
- §2. The editor uses shared Inspector controls, help, focus treatment and theme colors. Dashed and solid geometry distinguish saved and proposed paths. Timeline rows use text labels, dashed and solid range borders, and sampled-count markers.
- §3. The existing preview planner and commit commands preserve route and interval geometry, validation, history names and the file format. The preview uses the playback sampler. Copy updates the production-session clipboard. Transport navigation discards the draft. The workspace layout restores the saved Inspector setting when the editor closes.
- §4. Keyboard review covers the progress slider, Escape from the panel and the field, launcher focus restoration, and Apply at 150% in a narrow window. Invalid inputs show the existing validation message and keep Apply unavailable.
- §5. The native fixture verifies rescaled interval boundaries, reversed endpoint parity, selected copy geometry and the pasted position against playback. It also checks undo/redo, save/reopen and exported results. The field and timeline report the same preview count while the show playhead stays at the saved count. The fitted timeline shows resized moves extending past the saved show.

The captures and desktop measurements are from a Linux software renderer.
