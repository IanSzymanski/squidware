# Editor architecture

`App.tsx` creates one editor store and provides it to the extracted shell. No editor state is global, so another editor can use its own store in a test or future window. The canonical `.squid` schema is version 2, with pictures and adjacent moves stored separately; v1 imports migrate through the shared codec. The domain engine has no React, browser storage, or desktop bridge dependencies. See [the schema contract](schema-v2.md) for command identity and timing semantics.

## State and subscriptions

`src/editor/state.ts` separates project snapshot history, active set and selection, playback, transient interface state, and file-session state. Audio object URLs, save signatures, menus, selection and the playhead never enter the project or undo history.

`useEditorSelector` uses React's external-store subscription API. Selectors return a primitive or an existing immutable object reference; do not construct a new array or object on every snapshot. `subscribeSelector` also accepts a custom equality function for non-React subscribers. A UI setter publishes only when its value changes. A synchronous command publishes a single completed state to subscribers, including commands that update the project, selection and playback together.

`EditorField` and `EditorTimeline` subscribe to playback counts. The shell subscribes to project, selection, interface properties and an arrival boolean, so normal frames within a transition do not rerender the shell. `usePlaybackController` owns the animation clock, metronome and audio synchronization; it reads the starting count directly from the store. The active set changes at transition boundaries.

Workspaces, dialogs, shared controls and the main editor controller are extracted into `src/editor`. File operations remain in `useEditorController`, where the browser inputs, desktop bridge and object URL lifecycle belong. `useCommandController` binds native menu actions and browser shortcuts using current store state, avoiding stale event-handler closures. Native text-input undo/select-all behavior is preserved.

## Commands and extension boundaries

Every project mutation enters `store.dispatch(commandId, arguments)`. `src/editor/commands.ts` declares the argument types, stable IDs, names, descriptions, descriptive argument metadata, shortcut labels, enablement and handlers. `commandMetadata` can populate a future palette or scripting client; the help dialog and command-aware button tooltips already reuse it. TypeScript callers get checked argument shapes. Enablement and the domain validators reject invalid timing, navigation, field coordinates, roster references and project limits at runtime.

For example:

```ts
store.dispatch('set.update', { index: 1, update: { counts: 64, tempo: 144 } });
store.dispatch('selection.transform', { index: 1, ids: ['performer-id'], options: { dx: 0.625 } });
store.dispatch('history.undo');
```

Add a command by defining its arguments in `CommandArguments` and its metadata, enablement and handler in the registry. Project handlers call the store's private command context; components cannot pass arbitrary mutation callbacks into the store. Keep calculations in `domain.ts` and side effects in controllers. `file.open`, `file.save` and `file.save-as` use registered per-editor controller handlers. Both synchronous and asynchronous controller failures return `false` and surface a notification. A failed project validation records no edit.

`setValue` is restricted to non-project slices and is appropriate for session-only controls and playback frames. Shared editing operations, menus and shortcuts use commands. `project.load` validates before replacing history and resets selection, playback and draft epoch. Keyed set controls reset local numeric drafts when the current set or loaded project changes, including loading the same project ID again.

Snapshot history intentionally retains the existing 80-edit cap and JSON equality check. Before publishing an immutable edit, the engine validates metadata, sections, performers and changed set geometry, with whole-array set limits and unique IDs checked separately. Unchanged set objects retain their prior validation; performer identity or field-size changes require a complete check. Imports, initial state, and serialization always validate the complete project. Commands must preserve immutable objects for this sharing contract to hold. Snapshot equality, serialization and rendering still have measurable maximum-size costs; compact patches/history belong to issue #6. This refactor does not claim those optimizations.

## Verification

`src/editor/store.test.ts` exercises selective notifications, compound-command consistency, undo/redo, project limits, runtime navigation arguments, playback editing guards, roster and formation edits, file-controller registration, save/reopen compatibility, export data, recovery and sync/async error handling. The Electron workflow QA scripts exercise the real rendered application and desktop bridge with isolated test files and dialogs. Run the domain/editor tests, desktop tests and production build after changing these boundaries.
