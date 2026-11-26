# Field tools

The field has one tool strip above it. Its tools stay where they are and enable or disable with the selection; an unavailable tool explains why on hover or keyboard focus.

| Group | Tools |
| --- | --- |
| Pointer | **Select** (V), **Lasso** (L), **Pan** (H) and the **Select menu**: Select all, Clear selection, Invert selection, each section, each saved group, and **Selection tools and groups** |
| Shape | **Line**, **Arc**, **Circle**, **Block**, **Wave**, and **More shapes**: Bézier curve, Bézier wave, Scatter…, Browse saved formations, and the live formations editable on this set |
| Arrange | **Align**, **Rotate**, **Mirror** (with **Mirror options** for front / back) and **Place** |
| Motion | The **Motion** menu. One performer: Edit performer path, Draw performer path, Edit movement timing. Groups: Group route movement, each saved group movement on this move, Formation transition, Shared routes. This move: Move operations, Split transition, Choreography cues |
| Props | **Props** opens staging props |

The panel button at the right end shows or hides the [side panel](WORKSPACE_LAYOUT.md#the-side-panel).

## What the strip shows instead

- **A preview.** A shape, transform, spacing, coordinate or selection preview replaces the tools with the preview's name, the number of performers, and **Cancel** (Escape) and **Apply** (Enter). Parameters are in the Inspector and direct handles remain on the field. Each accepted operation uses its existing named undo transaction.
- **A docked editor.** **Move operations**, **Shared routes** and performer movement (**Edit movement timing** and **Draw performer path**) are named in the strip, which points to their Apply and Cancel in the side panel.
- **Playback and between sets.** The strip says **Playing**, **Between sets** or **Rehearsal passage**, names the set or move, and offers **Edit set N** to stop at that set and edit it.
- **3D and Rehearse mode.** The strip shows **Passages**, **Problems** and **Record video**. In the 3D view it also shows the **Camera** presets (Perspective, Front, Press box, Overhead) with the active preset pressed.

## View controls

Display controls float over the field's margin instead of sitting in the strip:

- **Travel paths** (top right): **Show paths from previous set** and **Show paths to next set**.
- **View options**: performer labels (**Show labels**, **Selected only**, **Hide labels**), **Show field grid**, **Snap to grid**, **Grid and snapping…**, **Focus field** and **Workspaces…**.
- The **2D / 3D / Split** control and the **Open 3D window** button.
- Zoom out, **Fit field** (the zoom percentage) and zoom in, with the snap chip beside them (bottom right). The snap chip opens **Grid and snapping**.
- One hint line and the pointer's coordinate readout (bottom left).

Field zoom, display toggles and camera choices do not alter physical coordinates or project history.

## Keyboard and small windows

Each tool is a button in the normal Tab order. On a menu button, Enter, Space or Down opens the menu; Up/Down and Home/End move between its items, Enter chooses, and Escape or Tab closes it and returns focus to the button. Escape closes an open menu before it cancels a preview. A dialog opened from a menu returns focus to that menu's button when it closes.

The strip never wraps. As it narrows, Align, Rotate, Mirror and Place fold into an **Arrange** menu, then the shapes fold into a **Shape** menu, then labeled tools show only their icons. [Workspace layout](WORKSPACE_LAYOUT.md#small-windows-and-ui-scale) gives the widths. The Command palette has every tool, the field grid and the camera commands.
