# Squidware

**Find your flow. A desktop drill design studio for marching ensembles.**

Squidware brings cast management, an interactive 2D field, 3D rehearsal, count-based playback, and printable drill books into one local workspace. It is built with Electron, React, TypeScript, and Three.js, with native project dialogs and no account requirement.

This is an independent early release of a Pyware-style alternative. It implements a complete basic design-to-rehearsal workflow; it does **not** claim feature parity with mature professional drill software or compatibility with proprietary Pyware files.

## What you can do

- **Design in 2D:** select individual performers or groups, marquee-select, drag, enter exact coordinates, snap to an 8-to-5 step grid, nudge, pan, zoom, and inspect paths from the previous set.
- **Shape formations:** create lines, arcs, circles, blocks, and waves; adjust width, depth, rotation, and block columns; rotate or scale a selection.
- **Rehearse in 3D:** orbit an actual WebGL field with section-colored performer markers, shadows, and perspective, front, and overhead cameras.
- **Build a production:** add, duplicate, reorder, and remove sets; assign move counts, tempo, easing, and rehearsal notes; undo and redo edits.
- **Manage the ensemble:** add performers, import a CSV roster, edit names and sections, and select sections from the field legend.
- **Play the show:** scrub the timeline, change playback speed, loop, use a metronome, and attach an audio track with a sync offset.
- **Review transitions:** inspect continuous minimum spacing and excessive stride flags, then select the affected performers on the field.
- **Take it to rehearsal:** save editable `.squid` projects; export PDF field charts, individual coordinate sheets, coordinate CSV, and the current chart as SVG.

The included **Tidal forces** demo has 64 performers across six editable sets. A blank production starts with four customizable sections and an opening set.

## Run the desktop app

Use **Node.js 24** and **pnpm 11.25.0**, the versions used by this repository's workflows. The package manager version is recorded in `package.json`.

```sh
git clone https://github.com/IanSzymanski/squidware.git
cd squidware
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm desktop
```

`pnpm desktop` starts the local development server and the Electron window together. Close the app or stop the command to stop both processes. Port 5173 must be available.

To run the built desktop application:

```sh
pnpm build
pnpm start
```

The built app works locally without a development server. A graphics device that supports WebGL is needed for 3D; the 2D editor remains available when 3D cannot initialize.

For renderer development in a browser, use `pnpm dev`. Browser preview uses file downloads and the browser print dialog in place of native desktop save and PDF dialogs.

## Build a distributable

On Windows, build the portable executable:

```sh
pnpm dist:win --publish never
```

Artifacts are written to `release/`. `pnpm dist --publish never` builds the configured target for the current host: portable EXE on Windows, DMG on macOS, or AppImage on Linux. Build each platform on its corresponding OS; signing and automatic updates are not configured.

The [desktop packaging workflow](.github/workflows/release.yml) builds all three platforms. Manual runs create workflow artifacts; pushing a `v*` tag additionally publishes a GitHub release after packaging succeeds. A configured target is not a guarantee that a particular platform build has already been tested or released.

## Verify changes

```sh
pnpm test
node --test scripts/desktop.test.cjs
pnpm build
pnpm exec electron . --smoke-test
```

- Vitest covers formation geometry, transforms, project validation, timeline sampling, timing conversion, roster import, coordinate export, and transition analysis.
- The desktop tests exercise the actual main-process and preload source with controlled dialogs and temporary files, including atomic saves, canceled dialogs, invalid requests, and renderer isolation.
- The native smoke test launches Electron, checks that the renderer and preload bridge load with Node access disabled, and exits. It requires a graphical desktop; the [CI workflow](.github/workflows/ci.yml) shows the sandboxed Xvfb setup used on Linux.

The [initial verification record](docs/VERIFICATION.md) records the checks completed for this release and their limits. Automated checks do not replace interactive review of drag selection, 3D graphics, audio devices, or printed output. See the [user guide](docs/USER_GUIDE.md) for a practical acceptance walkthrough.

## First rehearsal

1. Open the demo, select a set from the left panel, and select a section from the field legend.
2. Drag the group or apply a formation from the Inspector. Use **Undo** to compare changes.
3. Add a set and edit its **counts into the set**, tempo, and notes.
4. Switch to **3D preview**, then play or scrub the show. Check flagged transitions in the Inspector.
5. Save the production as a `.squid` file and export a rehearsal packet.

Read the [full user guide](docs/USER_GUIDE.md) for cast import, coordinate conventions, audio synchronization, and file handling.

## Keyboard shortcuts

Use `Ctrl` on Windows/Linux and `⌘` on macOS.

| Action | Shortcut |
| --- | --- |
| Play / pause | `Space` |
| Select / pan tool | `V` / `H` |
| Select all / clear selection | `Ctrl/⌘ A` / `Esc` |
| Move selection one 8-to-5 step | Arrow key |
| Move selection four steps | `Shift` + arrow key |
| Previous / next set | `[` / `]` |
| Undo / redo | `Ctrl/⌘ Z` / `Ctrl/⌘ Shift Z` |
| Save / Save As | `Ctrl/⌘ S` / `Ctrl/⌘ Shift S` |
| Open / new project | `Ctrl/⌘ O` / `Ctrl/⌘ N` |
| Export dialog / help in desktop | `Ctrl/⌘ P` / `F1` |

Editing shortcuts do not change a formation while typing into a form field. Performer buttons in the 2D field also support keyboard focus and Enter/Space selection.

## Files and architecture

`.squid` files are UTF-8 JSON with `schemaVersion: 1`, project metadata, field settings, sections, performers, complete positions for every set, transition timing, notes, and an audio offset. They contain no embedded audio, undo history, or cloud references. Project files are limited to 10 MiB of UTF-8 data; imports are validated before entering the editor.

Coordinates use yards: `x = 0` at the left goal line and `y = 0` at the back sideline. The standard field is 100 × 53⅓ yards, excluding end zones. The [engine contract](docs/domain.md) describes schema limits, timing, coordinate conventions, and transition calculations.

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Production workspace, playback, editing, import/export |
| `src/domain.ts` | Pure drill geometry, timeline, validation, and data exchange |
| `src/components/Field2D.tsx` | Interactive field and reusable SVG drawing |
| `src/components/Stage3D.tsx` | Three.js scene and camera controls |
| `src/components/PrintOutput.tsx` | Field chart and performer print layouts |
| `src/useProject.ts` | Undo/redo history and local recovery initialization |
| `electron/` | Isolated desktop window, native dialogs, saves, and PDF export |
| `scripts/` | Desktop development runner and native-boundary tests |

The desktop renderer has Node integration disabled and a small, fixed preload API. Production content does not require external network connections. Recovery uses local app storage; **Save** creates the portable file you can back up and share.

## Current scope

The editor supports up to 500 performers and 128 sets, straight travel between sets with constant-speed or eased timing, and standard college/high-school football markings. This release accepts only the standard 100 × 53⅓-yard field. Transition flags model performer centers, not instrument dimensions or marching technique. The figures in 3D are rehearsal markers, not uniform or instrument simulations.

Audio attachments last for the current session and must be reattached after reopening. There is no proprietary Pyware import/export, curved individual travel paths, performer assignment optimization, props editor, video export, multiplayer editing, or cloud synchronization in this release. The current roadmap is explicit about these gaps: [ROADMAP.md](ROADMAP.md).

Squidware is not affiliated with or endorsed by Pyware or its owners.
