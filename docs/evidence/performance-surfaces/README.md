# Performance surface review

The fixture starts on a college field. The review switches it to a 210 × 105 ft stage and places a 180 × 81 ft test image at X 15, Y 12 ft. The field, chart and overhead 3D preview use that placement. Reversing audience orientation moves the field and image together. A click on the transformed dot still selects A1 and reads X 30, Y 30 ft.

- [Football settings](football-settings.webp) and [custom stage preview](stage-settings.webp) at 1366 × 768
- [Configured field](stage-field.webp) and [reversed orientation](stage-flipped.webp)
- [Overhead 3D](stage-overhead.webp) with the same background and reference lines
- [Keyboard focus in high contrast](stage-compact.webp) at 1024 × 768 and 150% UI scale

The browser replay used the existing production settings dialog, number inputs, focus styles and editor history. The rejected indoor resize preserved the original production and history. A valid apply created one undo step and redo restored the field. A separate blank production accepted the indoor preset and added a performer inside its bounds.

The replay saved and reopened a v16 project, checked SVG bounds and image embedding, checked CSV coordinates and axis labels, and verified the browser print layout. The automated source, contract and native tests cover legacy football files along with the new codec and placement rules. [Browser report](browser-report.json)
