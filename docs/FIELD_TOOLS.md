# Field tools

The field has one toolbar row above the canvas. Its editing tools follow the explicit selection: Select, Lasso, Selection tools and Pan with nothing selected; Coordinates and incoming path/timing tools for one performer; Move, Rotate, Shape and Align for a group. Other editing actions, saved formations, shared routes, group movement, display settings and zoom are in **More**. Unavailable commands explain why on hover or keyboard focus.

A preview replaces the editing row with **Apply** and **Cancel**. Parameters remain in the Inspector and direct handles remain on the field. Each accepted operation uses its existing named undo transaction. During playback the row provides Pause; between arrivals it offers Return to set. In 3D it shows camera presets with the active preset marked. Dragging the camera clears that mark. The pop-out 3D button remains beside the view switch.

Tab reaches the toolbar once. Left/Right and Home/End move between its controls; Down on More enters the menu, where Up/Down and Home/End move between actions. Enter or Space activates the focused action. Escape closes More before canceling a preview. Commands close More; dialogs return focus to More when dismissed. Resizing moves focused overflow controls to More without creating project edits.

The row never wraps. At narrower widths or enlarged UI scales it moves lower-priority actions to More. A preview's overlay Inspector leaves the toolbar's Apply/Cancel and More in the uncovered area above the field. Field zoom, display toggles and camera choices do not alter physical coordinates or project history. The Command palette retains the same editing operations and includes field grid and camera commands.
