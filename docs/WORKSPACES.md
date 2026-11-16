# Personal workspaces

The header shows the active workspace. Open it to switch arrangements, change panels, choose a toolbar and compact/full timeline, or save the current arrangement under a name. Ctrl/Cmd+1 through Ctrl/Cmd+4 select Field, Design, Production and Rehearse; these shortcuts can be changed in Preferences. The Command palette also lists built-in and custom workspaces.

| Workspace | Starting arrangement |
| --- | --- |
| Field | Large 2D field, contextual editing toolbar, compact timeline, collapsed side panels |
| Design | 2D field, set list, Inspector and full timeline |
| Production | Production sheet, set list, Cast and compact timeline |
| Rehearse | 3D field, camera/rehearsal tools and full transport, collapsed side panels |

Inspector and Cast are tabs of the right panel in every workspace. Use Left/Right or Home/End on a tab to choose the other. Cast has the same placement in blank and populated productions. In Production, Inspector shows set properties; field editing is available by opening the field or through Commands. Full Cast table opens a dialog from Cast and returns to its panel on close.

Changes to an arrangement are remembered. **Save as…** makes a named custom workspace; **Rename…** changes its name. **Reset to defaults** restores a built-in's starting arrangement and name. Custom arrangements offer **Delete custom workspace**, which returns to Design. Names use 1–40 characters, are unique without regard to case, and custom names cannot take a built-in's name. Up to 16 custom workspaces can be kept.

Workspaces are personal device preferences. Switching keeps the selection, active set, playhead, production drafts and undo history. A running spatial preview or pointer gesture must finish before switching; a refused switch leaves it intact. An uncommitted text/number draft stays in its mounted panel when a workspace hides it, and can be resumed when the panel returns. Tab navigation and Enter/Escape retain the normal input behavior.

A workspace records panel widths and collapsed states, Inspector/Cast choice, toolbar set, timeline density, 2D/3D view and Production sheet visibility. A toolbar choice changes which actions are prominent. Features remain available through panels, the view controls and Commands. The full timeline retains its recording waveform; compact uses a shorter waveform while preserving count navigation and problem targets. Narrow windows still tuck panels temporarily; their Show buttons restore them without changing saved widths. [Panel resizing, focus mode and breakpoints](WORKSPACE_LAYOUT.md) retain their existing behavior.

Older Write layouts become Design, Review becomes Field and Rehearse retains its name. A Custom layout becomes **My layout**. Migration keeps chosen widths, collapsed panels, right panel and view. Damaged workspace entries fall back to Design with a visible notice while keeping other valid custom entries and unrelated preferences. Resetting Preferences restores all workspace defaults. Workspaces are never written into `.squid` or `.squidpack` productions.

Run `pnpm test:workflows --suite=workspaces,workspace,preferences,editor,cast,accessibility` after a production build. The `workspaces` owner covers native switching, draft retention, named-arrangement management, both laptop/desktop sizes, all themes, enlarged UI and persistence across a fresh Electron process. Source tests cover migration, malformed-entry recovery and unchanged project/selection/playback state. Rendered evidence is in [evidence/workspaces](evidence/workspaces/README.md).
