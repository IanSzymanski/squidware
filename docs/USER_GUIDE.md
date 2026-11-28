# Squidware user guide

Squidware is a desktop workspace for designing marching ensemble drill and preparing rehearsal materials. The desktop app opens with a welcome dialog over the editable demo: start a new production from a starter ensemble, open a production, explore the demo or review recovery copies. Your project stays on your device.

The window has a top bar with three modes. **Write** is the field with its tools, **Plan** is the production sheet, and **Rehearse** is 3D playback and review. In Write mode a tool strip sits above the field, a side panel with **Inspector** and **Cast** tabs sits beside it, and the transport, the timeline and a strip of set cards sit below it. The **Project menu** at the left of the top bar holds file actions, Templates, Recovery copies, History, Production settings, Preferences, Workspaces and Help. Every command is also in the Command palette (Ctrl/⌘ + K).

## A first production

1. On the welcome dialog, select a starter under **New production**: **Small band** (32 performers), **Marching band** (64), **Large band** (120), **Drum corps** (150) or **Indoor floor · winter guard, 20**. Each opens on the field with its performers in a staging block. **Empty field, add my own cast** opens the Cast tab and the Add performers dialog instead. Select **Explore the demo** to stay in **Tether**, a complete 165-member drum corps show (84 brass, 24 battery, 13 front ensemble, 44 guard, 67 sets) with its tempo map, score map, routes and group movement already in place. Later, **Project menu → New production…** offers **Blank production**, **Explore the demo** and your saved ensemble setups.
2. Select the production title in the top bar (or **Project menu → Production settings…**) to name the show and ensemble, select college or high-school field markings, and customize section names and colors.
3. On the **Cast** tab of the side panel, add performers or import a roster. New performers receive a position in every set.
4. In **Write** mode, select performers, arrange the opening picture, and save the project.
5. Select **Add set** at the end of the set strip, design the new set's arrival picture, and set the number of counts used to move into it.
6. Rehearse the transition with playback and 3D preview. Review spacing and stride flags.
7. Export field charts or individual coordinate sheets for rehearsal.

The opening set has zero move counts. Every later set stores the timing of the move **into that set**. If set 2 has 32 counts and set 3 has 24, the ensemble arrives at set 2 on count 32 and set 3 on count 56.

Alt+arrows nudges the selection; Shift+Alt uses the fast amount. Move buttons share the same command, with Shift-click for fast movement. Configure yard or production-step units and rotation/scale preset sizes in Preferences. See [editing increments](EDIT_INCREMENTS.md).

## Saving and recovery

Select the snap chip at the field's lower right, or **View options → Grid and snapping…**, to choose a production's step grid, subdivision, targets and group behavior. **Keep spacing** moves groups rigidly; **Individual dots** changes spacing and shows a drag preview before release. Escape cancels a drag, and Undo restores it. The snap chip names the active grid and mode. See [Grid and group snapping](GRID_SNAPPING.md) for numeric/nudge behavior, boundaries and personal defaults.

**Save** writes an editable `.squid` file through the native desktop dialog. Later saves reuse that destination. **Save As** creates another copy. **Open** accepts supported `.squid`, JSON or portable `.squidpack` files; JSON and package imports receive a `.squid` destination when saved.

A new or untouched production shows **No changes** beside its title until you edit it; its first Save still asks for a file name. **Unsaved changes** includes uncommitted field drafts. **Draft pending** disappears when you apply the edit with Enter or cancel it with Escape. Canceled or failed saves keep the unsaved status. If you edit while a save is in progress, that save keeps its earlier revision and your newer changes still need saving. Undo back to the saved revision restores the clean status. New/Open and closing the app protect unsaved work; correct or cancel invalid fields before replacing a production or leaving its dialog. See [file and draft behavior](FILE_STATE.md).

After a committed change, the desktop app writes recovery in the background to its application data folder. Open **Project menu → Recovery copies…**, or select the recovery indicator beside the save state in the top bar, to choose a dated copy. Up to 20 most recent copies or 100 MiB are kept across productions; the newest valid copy is always retained. Older copies expire. Save named project files and keep your usual rehearsal backups.

Recovery has its own status. **Recovery copy saved** means the automatic copy was written; use **Save** for a portable project file. Restoring a copy starts an unsaved production and asks for a project file destination on its first save. It does not overwrite a file you had open. Browser previews use asynchronous browser storage and remain subject to the browser's quota.

The project file includes cast, sections, all sets and positions, counts, tempo, easing, notes, field settings, and the audio offset. Audio data and undo history are not included. History lists named actions for Undo/Redo. It keeps up to 80 actions or 16 MiB of estimated history, with the latest action always retained even if larger. Older actions may expire, and opening a project starts a new history. Save named files for lasting versions.

Projects save in format version 2, which stores formation pictures separately from movement timing. Existing version 1 projects migrate automatically when opened, preserving their coordinates and playback. Saving writes version 2 for ordinary projects and version 3 for a nonempty tempo map, or version 4 for recording anchors. Older apps reject unsupported versions instead of discarding mapped timing. Unsupported newer versions display an update instruction.

Project files are limited to 10 MiB of UTF-8 data. Valid recovery from older versions' browser storage is migrated before its old key is removed. Unreadable originals are kept, with a notice in **Recovery copies**. If recovery is unavailable, save a project file, check disk space or permissions, and use **Retry / refresh copies**. Editing remains available.

In browser preview, Save downloads a project and PDF export opens the browser print dialog. The Electron app provides native open/save dialogs and direct PDF export.

## Personal preferences

In Preferences, **Field display → 2D field display** sets audience orientation, dot radius and label size in screen pixels, label visibility, and section/selection/custom coloring. Flipping turns the view 180°; pointer gestures and arrow keys follow the screen while coordinate descriptions and Inspector directions keep their field meaning. These choices persist on this device. Printed charts and SVG exports keep their standard orientation, section colors and labels. See [field display details](FIELD_DISPLAY.md).

Open **Project menu → Preferences** for device settings, grouped as **Appearance** (theme or Match system, accent color, field appearance such as the black-on-white Classic chart, the background behind the field, UI scale, panel layout, hints), **Field display** (2D/3D start view, paths, grid visibility, zoom, labels, coordinate precision), **Editing** (keyboard increments, snap, new move counts, formation tool defaults, new-production defaults, paper size and packet type) and **Shortcuts**. The section buttons at the top jump between them. Changes save automatically and do not mark your production as unsaved. Formation parameters take effect when you choose **Apply formation**; coordinate precision changes descriptions, without rounding stored positions.

Choose **Reset defaults** to restore the personal settings. If storage is unavailable, your choices work for the session and Preferences shows the error with **Retry save**. Unsupported newer preferences remain preserved until you update the app or reset them. Invalid numeric entries stay in Preferences until corrected or canceled with Escape. Production settings still belong to each show. See [the persistence policy](PREFERENCES.md).

## Cast and sections

Select the **Cast** tab of the side panel to select and edit performers beside the field. Clicking a row highlights its dot; clicking a dot reveals its row. Ctrl/Command-click toggles rows and Shift-click adds a range. Arrows/Home/End navigate the list, Space toggles selection and Enter selects the focused row. Select one performer to edit their name and section. Enter or blur applies a name edit; Escape cancels it. Each accepted edit can be undone.

Search by label/name and filter by section. Hidden selections are kept and explained; **Show selected performers** clears the filters to reveal them. Select all visible changes only filtered rows. **More Cast actions → Full Cast table** opens the whole roster in a dialog, and **Return to Cast panel** closes it. Select the **Inspector** tab for position tools. Removal affects every set and can be undone. See [Cast panel behavior](CAST_PANEL.md).

**Add performers** takes a count, a label prefix, and an existing section. Labels are generated sequentially while avoiding labels already in the production. The editing interface supports adding up to 500 performers.

Section names and colors live in **Production settings**. Four sections are present initially; you can rename them, change their colors, or add sections.

### Import a roster

Use **More Cast actions → Import roster CSV** on the Cast tab, **Import CSV** in the full Cast table, or **Import CSV instead** in the Add performers dialog. A typical file is:

```csv
label,name,section
B1,Alex Rivera,Brass
B2,"Morgan Lee, Jr.",Brass
W1,Sam Taylor,Woodwinds
P1,Jordan Chen,Percussion
G1,Casey Patel,Guard
```

The `label` column is required. `name` and `section` are optional. Section values match existing section names or IDs without regard to case; blank section values use the first section. Quote names containing commas. Duplicate labels, unknown sections, or malformed rows reject the import so you can correct the source file before trying again.

Roster import adds people to the current production. It does not import drill coordinates. New performers are placed near the front sideline in every existing set; arrange those positions before rehearsal.

## The 2D field

The standard field measures 100 × 53⅓ yards, excluding end zones. The bottom of the drawing is the front sideline, facing the audience; the top is the back sideline. Side 1 is the drawing's left half and Side 2 its right half.

Coordinates are stored in yards, with `(0, 0)` at the top-left corner. Coordinate sheets translate them into 8-to-5 steps relative to field markings. One 8-to-5 step is 0.625 yard.

### Select and move

- Click a performer to select them. Shift-click to add or remove performers from the selection.
- Drag across empty field space to draw a selection box. Hold Shift to add the enclosed performers to the existing selection.
- Click empty field space or press Escape to clear the selection.
- Select a section chip at the top of the Inspector, or a section in the tool strip's **Select menu**, to select all of its performers, or use **Select all**. While performers are selected the chips fold to their colors; **Show section names** expands them.
- Drag a selected performer to move the entire selected group. The group remains together at field boundaries.
- A multiple selection is framed on the field. Drag a corner handle to scale it about its center, or the round handle above the frame to rotate it. Shift scales in 5% steps and turns in 15° steps. Releasing applies one undoable edit; Escape cancels the drag.
- Alt + arrow keys move the selection by the preferred nudge increment (default one step). Shift + Alt + arrow uses the fast increment (default four steps, or 2.5 yards). Set the increments in Preferences. Plain arrows on the field change performer focus without editing.

Select a single performer and expand **Exact position** in the Inspector's **Position** section to enter **X · yards from left** and **Y · yards from back** for exact placement.

The view controls float over the field's margin. **View options** holds **Snap to grid**, which aligns dragging to the production's step grid, and **Show field grid**; hiding the grid does not turn snapping off. It also holds the performer label choices (**Show labels**, **Selected only**, **Hide labels**). **Travel paths** shows paths from the previous set or to the next set. A path is colored amber when its step is more than two thirds of the production's stride limit and red when it is over the limit, and the path legend at the field's lower left counts both.

One hint line at the field's lower left says what to do next, and the coordinates under the pointer read in the same corner. Turn the hint off with **Show hints** in Preferences.

Move edits apply to the current set. Editing is disabled during playback and between set arrivals. The tool strip then names the move and offers **Edit set N**; select it, or select a set card, to resume editing an arrival picture.

### Navigate the field

Select **Place** in the tool strip for [drill-language entry](COORDINATE_ENTRY.md). For one performer, enter both axes, such as `Side 1: 4 outside the 40; 6 behind front hash`. For a selection, use a relative phrase such as `3 steps forward, 1.5 yards right`. The visible side/unit choices resolve bare numbers; steps use the production step size. Enter focuses Apply, Escape cancels, and one accepted action creates one undo. Boundary crossings reject the entire preview. Rehearsal coordinate output retains its documented 8-to-5 convention.

Select the hand tool with **H** and drag to pan; return to selection with **V**. Alt-drag and middle-button drag also pan. Scroll to zoom around the pointer. Use the zoom buttons at the field's lower right or **Fit field** (the zoom percentage) to restore an overview. Double-click empty field space also fits the field.

### Create formations

The tool strip above the field holds the pointer tools (Select, Lasso, Pan and the **Select menu**), the shapes, the arrangers (**Align**, **Rotate**, **Mirror**, **Place**), the **Motion** menu and **Props**. Tools stay in place; one that does not apply right now explains why when focused. While a preview is open, the strip shows the preview's name with **Cancel** (Escape) and **Apply** (Enter), and the preview's parameters are in the Inspector.

Select **Align** in the tool strip to [align coordinates, distribute evenly or set exact intervals](SPACING_ALIGNMENT.md) for at least two selected performers. Choose X, Y or a rotated axis, and an anchor. Intervals support yards or production step units; **Each rank/file** spaces block rows or columns separately using an explicit lane tolerance. Inspect the guides, then Apply or Cancel. Exact spacing bypasses snapping and rejects field crossings. Apply creates one named undo action.

The Inspector's header shows the selected count and the section chips. Below it are the current set's **Counts** and **Tempo · BPM**, then the **Selection** section (**Position** for one performer): the coordinate in drill language, the selection's size in steps, the move into the set (counts, longest path and biggest step) and **Move**, **Rotate** and **Scale** buttons, each named with the size of its step. **Set N details** and **Move check** follow. Inspector sections can be collapsed by selecting their headings or using Enter/Space, and your expansion choices survive restart.

**Rotate** opens an [exact transform preview](EXACT_TRANSFORMS.md). Enter an angle and scale percentage; choose the selection center, a performer, custom coordinates or a field reference as pivot. The round field handle rotates, the square handle scales, and the crosshair moves the pivot. **Mirror** previews reflection across the 50; **Mirror options → Mirror front / back** uses the other field axis. Original dots have dashed outlines. Select **Apply** in the tool strip for one undoable edit, or **Cancel** to keep original positions. Out-of-field previews cannot be applied. Selecting another set or changing the selection cancels the preview.

The tool strip has **Line**, **Arc**, **Circle**, **Block** and **Wave**; **More shapes** adds Bézier curves, scatter and your saved formations. Select performers and select a shape to open a [formation preview](FORMATION_PREVIEWS.md). Adjust the interval, width, depth or bulge, rotation, center and block columns with numbers in the Inspector or with field handles. Lengths read in the production's steps on a football field. Each shape retains its own parameters for the session. **Apply**, or Enter on the field, accepts the visible positions as one undoable action. **Cancel**, or Escape outside an input, keeps the original positions. Shapes crossing a field boundary cannot apply. Choose **Select all** explicitly to reshape the ensemble.

A new shape starts at the selected performers' center, sized to their extent, at least the production's minimum spacing apart and inside the field. Under **Who goes where**, **Shortest** is the default assignment, so straight paths do not cross; choose **Positional** to preserve spatial order or **Roster** to use Cast order. Review the dashed paths, **Farthest moved** and the biggest step from the previous set before applying. Assignment stays fixed as you move or rotate a preview (choose a mode again to recompute it), and each accepted edit can be undone. Use **Optimize assignment…** for pins and other constraints.

The Inspector's **Rotate** and **Scale** buttons open the same exact preview with your preset step (15° and 10% by default). Dragging the selection frame's handles rotates or scales in place instead. When a group transformed with the handles would extend beyond the field, the app moves it inside the boundaries and uniformly shrinks it if necessary to preserve its shape. Check the resulting size and placement after large transformations. **Undo** restores the previous edit; **Redo** reapplies it.

### Keep a formation editable

In a formation preview, check **Keep as a live formation** and name it before **Apply**. The **Live formations** list, under **Set N details** in the Inspector, reopens saved line, arc, circle, block and curve geometry after save/reload. **Edit** selects its members and previews changes through the same field handles and numeric inputs. **Members** adds/removes performers and redistributes the preview; **Redistribute members** closes vacant slots with the visible positional or Cast assignment. **Cancel** keeps the saved shape; Apply and Detach each have one undo action.

Moving a dot individually detaches only that member and leaves a vacant slot. Other members do not move. **Detach selected** or **Detach all**, in the formation's **More** menu, removes membership while keeping the dots. Each performer can belong to one live formation per set; a conflicting preview explains which formation owns them and blocks Apply. **Copy to set** in the same menu previews the same members and slots on another picture; duplicate set creates independent formation IDs. New/hold/inserted pictures start with plain dots. Templates remain reusable, anonymous presets. See [live formation policies and file behavior](live-formations.md).

### Reuse setups and formations

Open **Project menu → Templates…** (also in the Command palette), or **More shapes → Browse saved formations** in the tool strip. **Save new template** captures an ensemble setup, the explicitly selected dot picture, or an adaptable shape. Give it a name and review the included data. Performer names and labels are excluded; section names are generic unless you check the inclusion option.

Choose a saved formation to preview it on the selected performers. Saved dot pictures require the same count; parametric shapes adapt to 1–500 selected performers. Adjust center/rotation, shape dimensions and positional or Cast order. Drag the preview's center handle or use its arrows; numeric fields give exact placement. Review the dashed travel paths, then **Apply saved formation** for one named undo action, or **Cancel / close** to leave positions unchanged. Parametric templates offer **Keep editable on this set** to retain their geometry and membership as a live formation; conflicting live membership must be edited or detached first. Out-of-field and stale previews cannot apply. Refresh a stale preview by choosing the template again.

**New production** lists saved ensemble setups and previews their anonymous roster, sections, field and opening tempo. Creating from a setup starts a fresh production; save current work before replacing it. Use **Import library** to review and add `.squidlib` files, and **Export library** or **Export selected** to review included names before sharing. Rename/remove entries under their management disclosure. The personal library persists on this device outside production files; transfer it by exporting a library. See [template behavior and privacy](template-library.md).

## Sets and production structure

The set strip under the timeline shows every set as a thumbnail card, in show order, with its number, name, counts and the number of problems in the move into it. Select a card to pause playback and jump to its arrival count. **Find set** in the transport searches every set by number or name. Drag a card onto another to reorder, or use Alt+Left and Alt+Right on a focused card. See [the set strip](set-list.md).

**Add set** at the end of the set strip adds the next set in one click: everyone holds the current picture, and the move into it takes the current set's counts. The arrow under it opens the full dialog, with **Hold positions** selected first and **Duplicate set**, **New set** and **Insert before** as the other choices; set the counts and tempo there, then select **Add set**. A hold or a duplicate placed before a move with custom paths or group movement keeps that move, because its performers start from the same spots. The new picture can then be changed independently. When the set strip is hidden, **Add set** is in the transport. See [set creation](SET_CREATION.md).

The Inspector lets you edit the set's counts and tempo at its top, and the set name, transition mode and notes under **Set N details**. Counts describe the move from the preceding set. Tempo is beats per minute for that move. The first set remains a zero-count opening picture.

Choose **Linear timing** for uniform progress along each straight path or **Ease in / out** for a smooth start and finish on the same path. Easing changes speed, not path shape. Use **Set actions → Move earlier** or **Move later** in the Inspector, or drag the set's card, to reorder a set. The first set always has zero counts; a set moved out of the opening position receives a move duration if needed.

**Set actions** also holds **Duplicate set**, **Hold positions**, **Insert set before**, **Split transition…**, **Choreography cues…** and **Delete set…**. Deleting a set connects its neighbors directly. Check the resulting transition before rehearsal. A production must retain at least one set.

A production can contain up to 128 sets. Set names, production titles, and section names commit when you leave the text input or press Enter; Escape cancels the current text draft.

**Plan** mode shows the [production sheet](production-sheet.md): every set's name, counts, BPM, notes, meter and rehearsal mark in one table, with the number of sets, total counts and running time above it. Selecting a cell arrives at that set, and **Open on field** returns to Write mode there.

## Tempo maps and fermatas

Open **Tempo map** in the Plan sheet's toolbar, **Timeline options → Tempo map…** in the transport, or the Command palette. Enter numeric CSV/TSV ranges as From count, To count, Start BPM, End BPM; equal BPMs make a fixed range and different BPMs make a linear ramp over counts. Enter fermatas as Count, Seconds. Preview the plot, exact intervals and duration before one undoable Apply. Cancel retains the original timing.

Ranges override base move tempos only within their intervals; musical anchors remain at absolute show counts through structural edits. Fermatas freeze positions after that count’s click while recording time continues; the metronome waits. Pause/resume preserves progress. Seeking to a held count begins its pause, and count stepping can skip it. Mapped shows save as schema v3; ordinary projects keep v2 saving. CSV and PDF exports include mapped timing. See [tempo semantics, limits and compatibility](tempo-map.md).

## Playback and audio

Use Play or Space to rehearse. Scrub the count timeline to inspect any point in a transition. First/previous/next/last controls jump to set arrivals. Playback speed ranges from 0.5× to 1.5×, with optional looping and a metronome. On narrow windows or at large UI scales, speed, loop and metronome are under **More playback options** (⋯) in the transport. **Timeline options** in the transport zooms the timeline, switches the ruler between measures and counts, and shows or hides set thumbnails. In **Rehearse** mode a large readout over the 3D view shows the set and the count within the move.

The displayed count is the cumulative show count. Written tempo can differ between moves; the total runtime accounts for those changes. The metronome accents every fourth cumulative count.

### Attach a rehearsal track

Choose **Attach audio** and select WAV, MP3, OGG, M4A or FLAC audio the system can decode. The timeline displays a waveform preview. Use the speaker control to mute or unmute the attached track.

Use **Align recording** in the Plan sheet's toolbar, **Timeline options** or the Command palette for variable-tempo recordings. Enter Count/Recording-seconds rows, review drift, then Apply as one undo action. Expand waveform assistance to preview the recording, select set arrivals and tap anchors with Enter/Space. Cancel leaves the saved timing unchanged. See [recording alignment](audio-alignment.md).

Set **Audio sync offset** in Production settings:

- A positive value starts playback farther into the recording. For example, `10` plays the audio at 0:10 when the show starts.
- A negative value delays the audio. For example, `-4` starts the recording four seconds after the drill begins.

The audio follows the show timeline and playback-speed setting. Recordings are limited to 200 MiB. Plain `.squid` files save the offset without recording bytes. To transfer the recording too, choose **Export → Portable production with audio**. Bundle it in one `.squidpack` file, or reference it relative to a folder you transfer together. Review the contents and size, then export. Open the package to restore its recording automatically. If a reference is missing or changed, choose **Relink audio**; drill and offset remain intact. Export again after edits or relinking. Audio decoding depends on Electron and the host system. See [portable package details and format](AUDIO_PACKAGES.md).

## 3D rehearsal

Select **3D** in the view control over the field, or switch to **Rehearse** mode, to see the same positions and playback on a textured field. Select **Split** to edit the 2D chart above a live 3D preview, which runs under it as a wide strip; the chart starts with the larger share and the divider changes it. Drag to orbit, right-drag to pan, and scroll to zoom. In 3D the tool strip shows the **Camera** buttons (**Perspective**, **Front**, **Press box** and **Overhead**), which reset the camera to views that frame the field, with **Passages**, **Problems** and **Record video** beside them. The small podium identifies the front sideline.

Click a performer to select them; Shift-click modifies the selection. Selection appears as a ground ring. Use the 2D field or Inspector to edit positions.

In **3D preview** or **Split review**, position the camera and choose **Saved views → Save current angle**. Give the view a name to keep it with the production. To restore a view, choose it in **Saved views** and select **Use view**. The same dialog lets you rename or delete views. Saving, renaming, and deleting a view can be undone.

The 3D performers are section-colored rehearsal markers by default. Select performers and expand **Facing** in the Inspector's **Selection** section to author a heading at a set. Select one performer in Cast and expand **Appearance** to add an instrument or guard marker or a costume color. These are simple visual cues. If 3D cannot initialize, switch to 2D to keep editing. [Performer facing and appearance](performer-facing.md)

### Choreography cues

Select performers on the field or in Cast. Open **Choreography cues** from the tool strip's **Motion** menu, the Inspector's **Set actions** menu or the Command palette. Choose the move, then choose **Add cue**, a preset, a start count, an end count, and the duration of each transition. Counts are measured from the start of the selected move. The time between the transitions holds the pose. **Flag up** requires flag equipment for everyone in the cue.

Lower-body cues share one track. Flag cues share a second track and can overlap a lower-body cue. Use **Review** on a cue to see its peak in 3D. Choose **Detailed** 3D quality to see the poses and flag animation. Add, edit, and remove are undoable project edits. A cue keeps its explicit performers even when the selection changes. Remove or adjust cues before editing a move's count below a cue's end or changing its endpoints.

In second position and plié, the right foot stays on the drill dot and the left foot steps out. Both feet stay planted during the bend and rise.

### 3D window

In the desktop app, choose **Open 3D window** (the arrow-out-of-a-box button beside the 2D / 3D / Split control), its command palette entry, or `Shift+T` to show the 3D preview in a separate window, for example on a second display. It follows the editor's set, count, playback, selection highlighting, previews and any 2D drag in progress, and its top bar shows the set, count and mode. The window is read-only: its camera buttons, quality choice and orbit/pan/zoom work, but clicking a performer does not change the selection. Edit positions in the main window.

Only one 3D window exists. Choosing the command again brings it to the front. While it is open, the field area shows a placeholder instead of a second 3D view: **Show 3D window** brings it forward and **Return 3D here** closes it. Opening the window from the inline 3D view switches the field back to 2D. Closing the window releases its graphics resources and returns the 3D option to the field.

The window remembers its size, position and display on this device. It reopens on that display, moved fully on screen if needed; if the display is disconnected, it opens centered on the main display. It stops drawing while minimized or hidden, and it keeps playback moving while the main window is minimized. If its graphics context fails, choose **Reload 3D preview** or **Close 3D window**; editing in the main window continues. The browser preview does not offer the 3D window, and `Shift+T` is free there for other commands.

### Staging props

In **2D field** or **Split review**, pause at a set and select **Props** in the tool strip. You can also search for **Staging props** in the Command palette. Choose **Add prop**, then click the footprint preview or enter the center coordinates. Enter its width, depth, height and orientation. The preview stripe points toward the front of the prop and a dashed footprint marks a hidden prop during editing.

A new prop starts with the same pose in every set. At another set, choose the prop and use **Edit prop** to move, resize, rotate or hide it there. Use **Start count** and **End count** to set when a move into that set travels. The prop holds before and after that window. Visibility changes at set arrival. **Apply prop** records one undo action, and **Remove prop** removes its placement from every set in one undoable edit.

The 2D field, 3D preview, rehearsal video and field charts show the saved props. Under **Planning footprint**, choose **Rectangle** or **Circle**. A rectangle uses the pose’s width, depth and orientation. A circle uses the larger of its width and depth for its diameter. The shape applies to the prop across the production. The 3D preview represents generic props with boxes.

Use **Prop type** before **Add prop** to choose a marimba, vibraphone, xylophone, timpani pair, percussion rack or keyboard. Each instrument starts with a planning footprint that you can adjust per set. Its 3D model keeps the same scale as it turns and moves, in both Lightweight and Detailed preview. Modeled equipment saves in `.squid` format v19. Open the sample and choose one of the three saved pit cameras to see the sideline against moving drill. [Front ensemble example](../format/examples/front-ensemble-v19.squid)

## Transition checks

The Inspector's **Move check** section analyzes the move into the selected set. Click a flag to review it at its show count. Spacing and stride flags highlight the performers and their paths. Clearance flags outline the affected footprints.

For the whole show, use the problem markers on the timeline. Each marker names the problem type, participants and count, such as “Spacing 1.13 yd · B4, B5 · count 6”. Nearby findings share a numbered marker. Arrow keys move along the markers, and Enter goes to a finding or opens a group. The problems badge in the top bar opens **Show-wide problems**, which lists findings and opens **Analysis rules**. Each set card also shows how many problems are in the move into that set.

The current checks are:

| Check | Warning | Higher-severity flag |
| --- | --- | --- |
| Closest center-to-center spacing during a move | Less than 1 yard | Less than 0.5 yard |
| Peak travel distance per count | More than 1.25 yards/count | More than 1⅔ yards/count |

Spacing is calculated across the continuous transition, so crossings between playback frames can be detected. For eased transitions, stride analysis accounts for peak speed rather than only average distance per count.

### Footprint clearance

In **Analysis rules**, expand **Footprint clearance** and enable **Check clearance with props**. Set a performer circle diameter or rectangle width and depth, then enter a required edge gap in yards and choose **Save rules**. A gap of zero checks for overlap only. The production-wide performer rectangle follows authored facing and defaults to facing the audience when no heading is available. Props use their saved planning shape, dimensions, movement and visibility.

In **Show-wide problems**, filter **Type** to **Clearance**. The results distinguish confirmed overlaps, confirmed gaps below your requirement and possible violations that need review. Choose a finding to inspect the named participants and footprint assumptions at the reported count. The first move includes the opening picture. A single-picture project checks its opening pose directly. [Editable clearance example](../format/examples/clearance-v20.squid)

Use the flags as a ground-plane rehearsal aid. Check instrument extensions, performers’ movement and vertical clearance on the field with the instructor. A flagged count is one point to inspect for the pair during that move. [Clearance calculation and limits](../format/FORMAT.md#v20-footprint-clearance)

## Export a rehearsal packet

Open **Export** in the top bar. Its **PDF drill book** section chooses one of two PDF contents. The dialog previews the first page, states what the file will hold (for example, one landscape chart for each set) and offers **Paper** (**Letter** or **A4**) as its one setting. **Save PDF** saves it:

- **Field charts:** a drawing for each set, with counts, cumulative arrival count, tempo, cast size, and rehearsal notes.
- **Performer coordinate sheets:** an individual sheet for each performer listing their position in every set in 8-to-5 steps.

The desktop app saves the chosen packet directly as a landscape PDF on the chosen paper. Browser preview uses Print / Save PDF. Long performer tables can span more than one page. Inspect a sample page before making rehearsal copies, particularly for long productions or unusually long labels and notes.

**Other formats** lists the remaining exports, one per row; hover or focus a row for its contents:

| Format | Contents |
| --- | --- |
| Coordinates CSV | All performers at all sets, including X and Y coordinates, arrival descriptions, timing, sections, and notes |
| Current chart SVG | A scalable drawing of the active set, using the current label visibility setting |
| Rehearsal video | A WebM preview of a set range, with the production title, revision, and current count displayed in the frame |
| `.squidpack` via Export | Editable production with bundled audio or a relative audio reference |
| `.squid` via Save | The editable production, suitable for reopening in Squidware |

CSV and SVG are snapshots, not replacements for the editable project. The coordinate CSV has a different structure from the roster import CSV and cannot be imported as a drill.

For a video, choose **Export → Rehearsal video**. Select the start and end sets, the fitted perspective or a saved view, a resolution, frame rate, and 3D quality. Each video can cover up to two minutes of drill. Use a shorter set range if a production is longer. **Detailed** shows equipment, choreography, and shadows. **Lightweight** uses simple markers. The clip follows the production’s tempo map, holds, and recording anchors at normal speed.

Videos are silent by default. Check **Include attached recording** to embed the part of the recording aligned to the clip. **Render video** shows progress and lets you cancel. After rendering, choose **Save WebM**. If encoding is unavailable, try a smaller resolution or frame rate. If the recording cannot be encoded, you can export a silent video. The Export menu also offers PDF drill books for devices without 3D support.

## Keyboard reference

Use Ctrl on Windows/Linux and Command on macOS. Form fields retain their normal typing behavior.

| Action | Shortcut |
| --- | --- |
| Play/pause | Space |
| Selection tool | V |
| Pan tool | H |
| Select all performers | Ctrl/⌘ + A |
| Clear selection | Escape |
| Focus another performer on the field | Arrow |
| Nudge selection | Alt + Arrow |
| Fast nudge | Shift + Alt + Arrow |
| Previous / next set | [ / ] |
| Undo | Ctrl/⌘ + Z |
| Redo | Ctrl/⌘ + Shift + Z |
| Save | Ctrl/⌘ + S |
| Save As | Ctrl/⌘ + Shift + S |
| Open | Ctrl/⌘ + O |
| New | Ctrl/⌘ + N |
| Export dialog, desktop | Ctrl/⌘ + P |
| Help, desktop | F1 |

In the 2D field, Tab enters at the remembered performer and the next Tab leaves the field. Arrows focus the nearest performer in that direction. Page Up/Down walks the roster so overlapping performers remain reachable; Home/End focuses the first/last performer. Enter or Space selects the focused performer; hold Shift to add or remove it. Focus uses a square outline, while selection uses a circular ring. Space on the field selects instead of starting playback. Alt + arrows moves the selected group, with Shift for four steps; movement remains locked during previews. Focusing a performer outside the zoomed viewport brings it into view.

## Acceptance walkthrough for a new build

1. Start the desktop app and select **Explore the demo** on the welcome dialog. Confirm the title (Tether), 165 performers, 67 sets, and both field presets render, and that show-wide analysis reports only the counter-march teaching finding explained in set TE 5.
2. Select several performers, drag them, nudge once and with Shift, then Undo and Redo. Check that one keypress causes one move and that dragging a group to the edge keeps it together.
3. Pan at 100% zoom, choose Fit field, then scroll to zoom and fit again. Inspect paths and label visibility.
4. Add a set, apply a formation, change counts/tempo, reorder it, and delete it. Confirm playback arrives at the edited pictures.
5. Switch to 3D, exercise all cameras, select a performer, and play through a transition. Return to 2D and verify the project is unchanged by camera controls.
6. Import a small valid roster; try a duplicate label and an unknown section and confirm the app explains the rejection.
7. Attach audio, adjust the offset, play, pause, scrub, loop, and mute. Export a bundled package, move it to another folder and reopen it with its recording and offset. Also exercise missing-reference relinking; plain `.squid` still requires reattachment.
8. Save a project, reopen it, and verify the cast, set positions, timing, and notes. Try canceling Open, Save As, and Export without changing the current project.
9. Export chart and coordinate PDFs, CSV, and SVG. Inspect the PDFs and SVG in a viewer and check a known performer's coordinates against the editor.
10. Make an edit and close the app. Confirm the unsaved-change prompt lets you cancel and return to save.

## Current boundaries

Current format support covers Squidware projects. Proprietary Pyware interchange, realistic uniforms, real-time collaboration and cloud synchronization remain roadmap items. Desktop packaging targets Windows, macOS and Linux. Check the release artifacts and platform results for the build you are using.

See [the roadmap](../ROADMAP.md) for the intended next areas of work and [the engine contract](domain.md) for the implemented calculations and data schema.

The [verification record](VERIFICATION.md) distinguishes checks completed for the initial release from the broader acceptance checklist above.

## History and field drafts

Open **Project menu → History…** to review named actions and available redo actions. A drag, committed note, performer name, title or color session produces one action. Text and colors apply on blur or Enter; Escape cancels the draft. Notes use Shift+Enter for a new line. Undo/Redo restores the saved-state indicator when returning to or leaving the saved revision. Native text undo remains available while an input has focus. See the [history contract](history.md) for retention and transaction details.


## Edit performer travel

Pause at an arrival set after the opening, select one performer, and choose **Edit performer path** in the tool strip's **Motion** menu or the Command palette. Choose Cubic Bézier and enter two control coordinates in field yards. The preview shows the saved path dashed, proposed path solid, and the sampled performer with a ring. Scrub Preview local count to inspect the move. Apply records one undo action; Cancel or Escape keeps the saved production. Reopen the editor to revise controls or choose Straight line to remove the curve.

Curves use Bézier parameter timing: speed can vary even with Linear timing selected. Show-wide problems reports conservative spacing and peak-stride bounds for curves, holds and submoves. Confirmed findings have a violating witness; possible findings need review. Select a finding to seek to its count and highlight the sampled paths. See [detailed check policy](detailed-path-analysis.md). Set positions remain the path endpoints. Curves save as format v5; older Squidware versions ask for an update. See [curve behavior and current operations](movement-paths.md).


## Independent performer timing

Select one performer at an arrival and choose **Motion → Edit movement timing**. Set departure/arrival counts for straight or cubic travel, or choose Hold position with start/end counts. Add intervals in count order; intermediate travel arrivals expose X/Y destinations. The last travel always arrives at the next set's dot. Before departure, in gaps and after the last arrival, hold the preceding position. Musical fermatas remain separate and stop the shared show count; performer holds leave other performers and the recording moving.

Timing parameters open in the side panel, with the preview on the main field at its current zoom and orientation. While the editor is open the tool strip names it (**Performer movement**). Preview local count to compare the selected performer with the rest of the cast. Apply and Cancel remain above the scrolling parameters in the side panel. Apply commits one named undo action; Cancel or Escape keeps the production. Enter activates the focused Apply button. A saved schedule opens in this editor through Edit performer path as well. Timed intervals use format v6. Choose **Motion → Move operations** to rescale move counts, reverse selected performers or copy/paste contiguous interval ranges with an explicit destination and coordinate frame. Review the preview before Apply; accepted edits are one undo action. [Detailed spacing/stride checks](detailed-path-analysis.md) run in the background; transition splitting and predecessor rewiring remain guarded for custom paths. See [operation policies](path-operations.md) and [the interval contract and limits](movement-schedules.md).

### Draw and refine individual travel

At an arrival picture, pause and select one performer. Use **Motion → Draw performer path** to draw a stroke or place numeric anchors for one selected interval on the main field, with its parameters docked beside it. Scroll to zoom and Alt-drag or middle-drag to pan. Fit the stroke, refine field handles or numeric controls, and Apply as one undo action. **Edit performer path** also exposes field handles and playback count ticks. See [individual path authoring](path-authoring.md) for fitting tolerances, fixed endpoints, keyboard controls, holds and shared-route scope.


## Compare constrained formation assignments

Start or Edit a formation preview with 2–500 selected performers and choose **Optimize assignment…**. Keep section slots, pin member/destination pairings, prohibit pairings, enter explicit instrument/role tags, or capture a section's ordered slot sequence. Blank roles mean unknown and need explicit permission to enter restricted slots. Compare the current mapping with shortest-total and balanced-member alternatives, including travel, spacing/crossing flags and peak step-demand bounds. Inspect both adjacent moves at fractional counts. **Use proposal** returns to the draft; **Apply formation** creates one undo action. Cancel and infeasible comparisons leave the production unchanged. Saved restrictions stay with the editable formation in format v11. See [constraint semantics, objective tradeoffs and limits](assignment-optimization.md).

## Control transitions between reusable formations

Select 2–500 performers at an arrival set in 2D, then choose **Motion → Formation transition** in the tool strip. Choose editable formations on both adjacent sets and review the fixed member-to-slot mapping. Set straight/curved travel, bend, departure/arrival and member stagger; existing authored paths stay protected until explicitly replaced. **Mapping and overrides** edits one member’s intervals independently. Scrub fractional counts and compare selected travel/peak demand and all-cast spacing/stride findings. **Apply transition** commits only selected paths on the incoming move as one undo action; Cancel keeps the production unchanged. Endpoints, identities, constraints, counts and other moves remain intact through save/reopen. See [transition controls, preservation policies and limits](formation-transitions.md).

## Shared routes

Open **Motion → Shared routes** in the tool strip, or the Command palette, while paused at a set. No performer selection is required. Draw or place numeric anchors on the main field, refine handles and distance ticks, then Apply as one undo action. Parameters use the side panel with pinned Apply and Cancel, and the tool strip names the editor; the current field zoom, pan and orientation remain available. Cancel leaves saved geometry unchanged. Starting playback, seeking a count or selecting a set discards the draft. See [shared route authoring](shared-routes.md).

## Follow, counter-march and conveyor groups

Pause at an arrival set in 2D, select 2–500 performers and choose **Motion → Group route movement** in the tool strip or the Command palette. Choose a shared route and ordered members; member 1 is the leader/reference. Follow the leader uses count delays, Counter-march requires explicit forward/reverse cues, and Conveyor uses fixed yard offsets along the route. Add direction/stop cues explicitly; mode selection preserves the program. Review entry/exit connectors, count ticks, travel and full-cast spacing/stride findings before **Apply group · one undo**. Saved individual paths remain dormant and return when a member leaves. Closed loops validate the last-to-first gap, wrap through multiple laps and can space members evenly. Save/reopen retains the v12 program. See [group movement controls, operations and limits](group-movement.md).


## Indoor floors and custom stages

In **Project menu → Production settings → Performance surface**, choose **Indoor floor** or **Custom stage**, then set the width, depth, coordinate units and reference line spacing. The preview shows the outline and reference lines before you apply. **Apply surface** records one undo action. If existing dots, prop centers, paths, formations or routes sit outside the proposed surface, move them inside the new boundary before applying the resize.

The back-left corner is X 0, Y 0. X increases to the right and Y increases toward the audience edge. In **Enter coordinates**, enter a pair such as `X 12, Y 6 ft` to place one performer. The audience orientation preference turns the 2D view without changing any dot coordinates.

Import a PNG or JPEG to show a floor plan or stage markings. Set its X and Y from the same origin and enter its width and depth, or choose **Fit to surface**. The image is embedded in the saved project and appears in 2D, 3D and chart exports.
