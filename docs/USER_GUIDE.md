# Squidware user guide

Squidware is a desktop workspace for designing marching ensemble drill and preparing rehearsal materials. The desktop app opens with the editable demo and offers available recovery copies. Choose a production and time to restore. Your project stays on your device.

## A first production

1. Use the project menu to choose **New project**, then **Blank production**. Use **Explore the demo** to learn with 64 performers already placed.
2. Open **Production settings** to name the show and ensemble, select college or high-school field markings, and customize section names and colors.
3. In **Cast**, add performers or import a roster. New performers receive a position in every set.
4. Return to **Design**. Select performers, arrange the opening picture, and save the project.
5. Add the next set, design its arrival picture, and set the number of counts used to move into it.
6. Rehearse the transition with playback and 3D preview. Review spacing and stride flags.
7. Export field charts or individual coordinate sheets for rehearsal.

The opening set has zero move counts. Every later set stores the timing of the move **into that set**. If set 2 has 32 counts and set 3 has 24, the ensemble arrives at set 2 on count 32 and set 3 on count 56.

Alt+arrows nudges the selection; Shift+Alt uses the fast amount. Move buttons share the same command, with Shift-click for fast movement. Configure yard or production-step units and rotation/scale preset sizes in Preferences. See [editing increments](EDIT_INCREMENTS.md).

## Saving and recovery

Use **Grid and snapping** beside the field magnet to choose a production's step grid, subdivision, targets and group behavior. **Keep spacing** moves groups rigidly; **Individual dots** changes spacing and shows a drag preview before release. Escape cancels a drag, and Undo restores it. The active mode appears on the field. See [Grid and group snapping](GRID_SNAPPING.md) for numeric/nudge behavior, boundaries and personal defaults.

**Save** writes an editable `.squid` file through the native desktop dialog. Later saves reuse that destination. **Save As** creates another copy. **Open** accepts supported `.squid`, JSON or portable `.squidpack` files; JSON and package imports receive a `.squid` destination when saved.

**Unsaved changes** beside the production title includes uncommitted field drafts. **Draft pending** disappears when you apply the edit with Enter or cancel it with Escape. Canceled or failed saves keep the unsaved status. If you edit while a save is in progress, that save keeps its earlier revision and your newer changes still need saving. Undo back to the saved revision restores the clean status. New/Open and closing the app protect unsaved work; correct or cancel invalid fields before replacing a production or leaving its dialog. See [file and draft behavior](FILE_STATE.md).

After a committed change, the desktop app writes recovery in the background to its application data folder. Open **Project menu → Recovery copies**, or click the recovery status at the bottom of the editor, to choose a dated copy. Up to 20 most recent copies or 100 MiB are kept across productions; the newest valid copy is always retained. Older copies expire. Save named project files and keep your usual rehearsal backups.

Recovery has its own status. **Recovery copy saved** means the automatic copy was written; use **Save** for a portable project file. Restoring a copy starts an unsaved production and asks for a project file destination on its first save. It does not overwrite a file you had open. Browser previews use asynchronous browser storage and remain subject to the browser's quota.

The project file includes cast, sections, all sets and positions, counts, tempo, easing, notes, field settings, and the audio offset. Audio data and undo history are not included. History lists named actions for Undo/Redo. It keeps up to 80 actions or 16 MiB of estimated history, with the latest action always retained even if larger. Older actions may expire, and opening a project starts a new history. Save named files for lasting versions.

Projects save in format version 2, which stores formation pictures separately from movement timing. Existing version 1 projects migrate automatically when opened, preserving their coordinates and playback. Saving writes version 2 for ordinary projects and version 3 for a nonempty tempo map. Older apps reject unsupported versions instead of discarding mapped timing. Unsupported newer versions display an update instruction.

Project files are limited to 10 MiB of UTF-8 data. Valid recovery from older versions' browser storage is migrated before its old key is removed. Unreadable originals are kept, with a notice in **Recovery copies**. If recovery is unavailable, save a project file, check disk space or permissions, and use **Retry / refresh copies**. Editing remains available.

In browser preview, Save downloads a project and PDF export opens the browser print dialog. The Electron app provides native open/save dialogs and direct PDF export.

## Personal preferences

The **2D field display** section sets audience orientation, dot radius and label size in screen pixels, label visibility, and section/selection/custom coloring. Flipping turns the view 180°; pointer gestures and arrow keys follow the screen while coordinate descriptions and Inspector directions keep their field meaning. These choices persist on this device. Printed charts and SVG exports keep their standard orientation, section colors and labels. See [field display details](FIELD_DISPLAY.md).

Open **Project menu → Preferences** for device settings: panel layout, 2D/3D view, labels, paths, grid visibility, snap, zoom, keyboard increments, formation tool defaults, coordinate decimals, paper size, packet type, and geometric check thresholds. Changes save automatically and do not mark your production as unsaved. Formation parameters take effect when you choose **Apply formation**; coordinate precision changes descriptions, without rounding stored positions.

Choose **Reset defaults** to restore the personal settings. If storage is unavailable, your choices work for the session and Preferences shows the error with **Retry save**. Unsupported newer preferences remain preserved until you update the app or reset them. Invalid numeric entries stay in Preferences until corrected or canceled with Escape. Production settings still belong to each show. See [the persistence policy](PREFERENCES.md).

## Cast and sections

Open **Cast** to select and edit performers beside the field. Clicking a row highlights its dot; clicking a dot reveals its row. Ctrl/Command-click toggles rows and Shift-click adds a range. Arrows/Home/End navigate the list, Space toggles selection and Enter selects the focused row. Select one performer to edit their name and section. Enter or blur applies a name edit; Escape cancels it. Each accepted edit can be undone.

Search by label/name and filter by section. Hidden selections are kept and explained; **Show selected performers** clears the filters to reveal them. Select all visible changes only filtered rows. Use **Full Cast table** for the expanded roster, **Dock Cast beside field** to return, or **Show Inspector** for position tools. Removal affects every set and can be undone. See [Cast panel behavior](CAST_PANEL.md).

**Add performers** takes a count, a label prefix, and an existing section. Labels are generated sequentially while avoiding labels already in the production. The editing interface supports adding up to 500 performers.

Section names and colors live in **Production settings**. Four sections are present initially; you can rename them, change their colors, or add sections.

### Import a roster

Use **Import CSV** from Cast or the Add performers dialog. A typical file is:

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
- Click a section in the legend to select all of its performers, or use **Select all**.
- Drag a selected performer to move the entire selected group. The group remains together at field boundaries.
- Alt + arrow keys move the selection by the preferred nudge increment (default one step). Shift + Alt + arrow uses the fast increment (default four steps, or 2.5 yards). Set the increments in Preferences. Plain arrows on the field change performer focus without editing.

Select a single performer to enter **X · yards from left** and **Y · yards from back** in the Inspector for exact placement.

The snap control aligns dragging to the 8-to-5 step grid. The visual field-grid control is separate; hiding the grid does not turn snapping off. Use labels and previous-set paths as needed to inspect busy formations.

Move edits apply to the current set. Editing is disabled during playback and between set arrivals. Choose a set from the left panel or use **Return to set to edit** to resume editing an arrival picture.

### Navigate the field

Choose **Place** in the selection bar for [drill-language entry](COORDINATE_ENTRY.md). For one performer, enter both axes, such as `Side 1: 4 outside the 40; 6 behind front hash`. For a selection, use a relative phrase such as `3 steps forward, 1.5 yards right`. The visible side/unit choices resolve bare numbers; steps use the production step size. Enter focuses Apply, Escape cancels, and one accepted action creates one undo. Boundary crossings reject the entire preview. Rehearsal coordinate output retains its documented 8-to-5 convention.

Select the hand tool with **H** and drag to pan; return to selection with **V**. Alt-drag and middle-button drag also pan. Scroll to zoom around the pointer. Use the zoom buttons or **Fit field** to restore an overview. Double-click empty field space also fits the field.

### Create formations

Choose **Align** in the selection bar to [align coordinates, distribute evenly or set exact intervals](SPACING_ALIGNMENT.md) for at least two selected performers. Choose X, Y or a rotated axis, and an anchor. Intervals support yards or production step units; **Each rank/file** spaces block rows or columns separately using an explicit lane tolerance. Inspect the guides, then Apply or Cancel. Exact spacing bypasses snapping and rejects field crossings. Apply creates one named undo action.

The Inspector's selection bar keeps the selected count, coordinates or group bounds, and **Move**, **Rotate**, **Shape**, and **Mirror** actions visible. **Move** opens position controls; **Shape** opens formation parameters. Inspector sections can be collapsed by clicking their headings or using Enter/Space, and your expansion choices survive restart. Align explains its availability when focused; alignment tools are still planned.

**Rotate** opens an [exact transform preview](EXACT_TRANSFORMS.md). Enter an angle and scale percentage; choose the selection center, a performer, custom coordinates or a field reference as pivot. The round field handle rotates, the square handle scales, and the crosshair moves the pivot. **Mirror** previews reflection across the 50; choose **Flip front to back** for the other field axis. Original dots have dashed outlines. Choose **Apply transform** for one undoable edit, or **Cancel** to keep original positions. Out-of-field previews cannot be applied. Selecting another set or changing the selection cancels the preview.

Formation tools provide **Line**, **Arc**, **Circle**, **Block**, and **Wave**. Select performers and choose a shape to open a [formation preview](FORMATION_PREVIEWS.md). Adjust width, depth/bulge, rotation, center and block columns with numbers or field handles. Each shape retains its own parameters for the session. **Apply formation**, or Enter on the field, accepts the visible positions as one undoable action. **Cancel**, or Escape outside an input, keeps the original positions. Shapes crossing a field boundary cannot apply. Choose **Select all** explicitly to reshape the ensemble.

The initial formation center is the selected performers' center. **Positional order** preserves their spatial order; choose **Roster order** to use Cast order instead. Review the dashed paths and total/longest travel before applying. Assignment stays fixed as you move or rotate a preview, and each accepted edit can be undone. Pinning and a shortest-travel solver remain planned.

Selection controls also rotate the group by 15° or compress/expand it by 10%. When a formation or transformed group extends beyond the field, the app moves it inside the boundaries and uniformly shrinks it if necessary to preserve its shape. Check the resulting size and placement after large transformations. **Undo** restores the previous edit; **Redo** reapplies it.

## Sets and production structure

The left panel lists the production's sets with thumbnails. Click a set to pause playback and jump to its arrival count.

**Add set** inserts a copy of the current picture immediately after it, with a default 32-count move. **Duplicate current set** uses the same starting behavior. The new picture can then be changed independently.

The Inspector lets you edit the set name, counts, tempo, transition mode, and notes. Counts describe the move from the preceding set. Tempo is beats per minute for that move. The first set remains a zero-count opening picture.

Choose **Constant speed** for uniform progress along each straight path or **Ease in / out** for a smooth start and finish on the same path. Easing changes speed, not path shape. Use the order controls to move a set earlier or later. The first set always has zero counts; a set moved out of the opening position receives a move duration if needed.

Deleting a set connects its neighbors directly. Check the resulting transition before rehearsal. A production must retain at least one set.

A production can contain up to 128 sets. Set names, production titles, and section names commit when you leave the text input or press Enter; Escape cancels the current text draft.

The **Production** view summarizes the cast, sets, total counts, runtime at written tempos, and rehearsal notes. Jump back to a set from its table to edit it.

## Tempo maps and fermatas

Open **Sheet → Tempo map**, **Timeline view → Tempo map** or the Command palette. Enter numeric CSV/TSV ranges as From count, To count, Start BPM, End BPM; equal BPMs make a fixed range and different BPMs make a linear ramp over counts. Enter fermatas as Count, Seconds. Preview the plot, exact intervals and duration before one undoable Apply. Cancel retains the original timing.

Ranges override base move tempos only within their intervals; musical anchors remain at absolute show counts through structural edits. Fermatas freeze positions after that count’s click while recording time continues; the metronome waits. Pause/resume preserves progress. Seeking to a held count begins its pause, and count stepping can skip it. Mapped shows save as schema v3; ordinary projects keep v2 saving. CSV and PDF exports include mapped timing. See [tempo semantics, limits and compatibility](tempo-map.md).

## Playback and audio

Use Play or Space to rehearse. Scrub the count timeline to inspect any point in a transition. First/previous/next/last controls jump to set arrivals. Playback speed ranges from 0.5× to 1.5×, with optional looping and a metronome.

The displayed count is the cumulative show count. Written tempo can differ between moves; the total runtime accounts for those changes. The metronome accents every fourth cumulative count.

### Attach a rehearsal track

Choose **Attach audio** and select WAV, MP3, OGG, M4A or FLAC audio the system can decode. The timeline displays a waveform preview. Use the speaker control to mute or unmute the attached track.

Set **Audio sync offset** in Production settings:

- A positive value starts playback farther into the recording. For example, `10` plays the audio at 0:10 when the show starts.
- A negative value delays the audio. For example, `-4` starts the recording four seconds after the drill begins.

The audio follows the show timeline and playback-speed setting. Recordings are limited to 200 MiB. Plain `.squid` files save the offset without recording bytes. To transfer the recording too, choose **Export → Portable production with audio**. Bundle it in one `.squidpack` file, or reference it relative to a folder you transfer together. Review the contents and size, then export. Open the package to restore its recording automatically. If a reference is missing or changed, choose **Relink audio**; drill and offset remain intact. Export again after edits or relinking. Audio decoding depends on Electron and the host system. See [portable package details and format](AUDIO_PACKAGES.md).

## 3D rehearsal

Switch from **2D field** to **3D preview** to see the same positions and playback on a textured field. Drag to orbit, right-drag to pan, and scroll to zoom. The **Perspective**, **Front**, and **Overhead** buttons reset the camera to useful views. The small podium identifies the front sideline.

Click a performer to select them; Shift-click modifies the selection. Selection appears as a ground ring. Use the 2D field or Inspector to edit positions.

The 3D performers are section-colored rehearsal markers. Their appearance does not model actual uniforms, instruments, guard equipment, body orientation, or marching technique. If a graphics context cannot initialize, the app shows a fallback message. Switch to 2D to continue designing; after a temporary graphics interruption, leave and reopen 3D to retry.

## Transition checks

The Inspector analyzes the move into the selected set. Click an issue to select its performer or pair and show their paths.

The current checks are:

| Check | Warning | Higher-severity flag |
| --- | --- | --- |
| Closest center-to-center spacing during a move | Less than 1 yard | Less than 0.5 yard |
| Peak travel distance per count | More than 1.25 yards/count | More than 1⅔ yards/count |

Spacing is calculated across the continuous transition, so crossings between playback frames can be detected. For eased transitions, stride analysis accounts for peak speed rather than only average distance per count.

Flags help identify moves to review. They do not certify safe movement, account for instrument clearance, model individual ability, or optimize routes. A lack of flags is not a substitute for instructor review on the field. The opening picture has no incoming transition to analyze.

## Export a rehearsal packet

Open **Export** and choose one of the two PDF layouts:

- **Field charts:** a drawing for each set, with counts, cumulative arrival count, tempo, cast size, and rehearsal notes.
- **Performer coordinate sheets:** an individual sheet for each performer listing their position in every set in 8-to-5 steps.

The desktop app saves the chosen packet directly as a landscape Letter PDF. Browser preview uses Print / Save PDF. Long performer tables can span more than one page. Inspect a sample page before making rehearsal copies, particularly for long productions or unusually long labels and notes.

Additional exports are:

| Format | Contents |
| --- | --- |
| Coordinates CSV | All performers at all sets, including raw yards, coordinate descriptions, timing, sections, and notes |
| Current chart SVG | A scalable drawing of the active set, using the current label visibility setting |
| `.squidpack` via Export | Editable production with bundled audio or a relative audio reference |
| `.squid` via Save | The editable production, suitable for reopening in Squidware |

CSV and SVG are snapshots, not replacements for the editable project. The coordinate CSV has a different structure from the roster import CSV and cannot be imported as a drill.

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

1. Start the desktop app and open the demo. Confirm the title, 64 performers, six sets, and both field presets render.
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

This release does not read or write proprietary Pyware projects, attach curved paths to individual performers, automatically optimize assignments, design props or equipment, render realistic uniforms, export video, collaborate in real time, or synchronize to a cloud service. Desktop packaging is configured for Windows, macOS, and Linux; release artifacts and successful platform checks should be verified for the build you are using.

See [the roadmap](../ROADMAP.md) for the intended next areas of work and [the engine contract](domain.md) for the implemented calculations and data schema.

The [verification record](VERIFICATION.md) distinguishes checks completed for the initial release from the broader acceptance checklist above.

## History and field drafts

Open **History** beside Undo/Redo to review named actions and available redo actions. A drag, committed note, performer name, title or color session produces one action. Text and colors apply on blur or Enter; Escape cancels the draft. Notes use Shift+Enter for a new line. Undo/Redo restores the saved-state indicator when returning to or leaving the saved revision. Native text undo remains available while an input has focus. See the [history contract](history.md) for retention and transaction details.
