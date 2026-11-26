# Modes and personal workspaces

The top bar has three modes. Each is a stage of work, and each remembers its own arrangement.

| Mode | Shows | Built-in workspace |
| --- | --- | --- |
| **Write** | The 2D field, the tool strip, the side panel and the show strip with its set strip | Design |
| **Plan** | The [production sheet](production-sheet.md) with the transport and timeline | Production |
| **Rehearse** | The 3D field with camera, passage, problem and video tools, and the transport and timeline | Rehearse |

Select a mode in the top bar, or press Ctrl/Cmd+2, Ctrl/Cmd+3 or Ctrl/Cmd+4. The mode in use is pressed. The mode buttons are unavailable while a preview, pointer gesture or dialog is active; their help says to finish it first. The Command palette lists **Write mode**, **Plan mode** and **Rehearse mode**, and the shortcuts can be changed in Preferences.

## Workspaces

A workspace remembers the mode, the 2D / 3D / Split view, the side panel (Inspector or Cast, its width and whether it is collapsed) and whether the set strip is shown. The three modes use the built-in workspaces above. Two more built-in workspaces and any you save are in **Project menu → Workspaces…**, which **View options → Workspaces…** over the field also opens.

| Workspace | Arrangement |
| --- | --- |
| Write | The field, tools and side panel |
| Plan | The production sheet |
| Rehearse | 3D playback and review |
| Review | The 2D field beside a live 3D preview |
| Field | The field alone, with a compact timeline (no set strip) |

In the **Workspaces** dialog:

- Select a workspace to switch to it. The active one has a check mark. Ctrl/Cmd+1 selects Field. The Command palette lists **Field workspace**, **Review workspace** and each saved workspace by name.
- Type a name under **Save the current arrangement as** and select **Save workspace** to keep the arrangement you have now. Up to 16 saved workspaces can be kept.
- **Rename** changes a saved workspace's name. The trash button deletes it; if it was active, Write mode opens.
- The reset button beside a built-in workspace restores its original arrangement and name.

Names use 1–40 characters and are unique without regard to case. A saved workspace cannot take a built-in workspace's name.

Field, Review and saved workspaces that edit on the field show **Write** as the pressed mode. Selecting **Write** from one of them returns to the Write workspace. A saved workspace made from Rehearse shows **Rehearse** as pressed, and one made from Plan shows **Plan**.

Changes to an arrangement are remembered as you make them: resizing or collapsing the side panel, choosing the Inspector or Cast tab, changing the view, or hiding the set strip updates the active workspace.

## What switching keeps

Workspaces are personal device preferences. Switching keeps the selection, active set, playhead, production drafts and undo history. A running spatial preview or pointer gesture must finish before switching; a refused switch leaves it intact. An uncommitted text or number draft stays in its panel when a workspace hides it, and can be resumed when the panel returns. Switching leaves **Focus field** mode. Workspaces are never written into `.squid` or `.squidpack` productions.

Features remain available in every mode through the Command palette. Narrow windows open the side panel over the field without changing its saved width. [Workspace layout](WORKSPACE_LAYOUT.md) describes panel resizing, focus mode and breakpoints.

## Split review

Select **Split** in the view control over the field, or open the **Review** workspace. Both panes share selection, the active set and the playhead. Drag the divider to resize, or focus it and use the arrow keys. The panes stack when the field area is narrow. Press Enter on the divider or select **2D** to close the 3D pane. The 3D pane offers Perspective, Press box, Front and Overhead cameras. It starts in Lightweight quality, which you can change in the pane.

## Older preferences

Older Write layouts become the Write workspace, the older Review preset becomes Field, and Rehearse keeps its name. A Custom layout becomes **My layout**. Migration keeps the chosen panel width, collapsed state, side panel tab and view. Damaged workspace entries fall back to Write with a visible notice and a **Dismiss** button, while other valid saved workspaces and unrelated preferences are kept. Resetting Preferences restores all workspace defaults.

## Validation

Run `pnpm test:workflows --suite=workspaces,workspace,preferences,editor,cast,accessibility` after a production build. The `workspaces` owner covers switching, draft retention, saved-workspace management, laptop and desktop sizes, all themes, enlarged UI and persistence across a fresh Electron process. Source tests cover migration, malformed-entry recovery and unchanged project, selection and playback state. Rendered evidence of the earlier workspace switcher is in [evidence/workspaces](evidence/workspaces/README.md).
