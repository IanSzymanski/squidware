# Project files, drafts and recovery

The status beside the production title describes the explicit project file. **Unsaved changes** remains visible until the current revision has been saved successfully. A pending text, color or numeric draft adds **Draft pending**, even when the committed production matches the last saved file. Recovery status appears separately in the footer; a recovery write never changes the saved-file baseline.

New productions, the startup demo and restored recovery copies have no saved revision (`savedRevision: null`). They require a project-file destination. Opening a validated file establishes its revision as the baseline. Browser imports and desktop JSON imports still require a new `.squid` destination on the next save. A generic engine `project.load` does not establish a saved baseline: the file controller must explicitly record a successful open.

Save captures the immutable production, session revision and project epoch after the focused field commits. Invalid or pending drafts block the save. The saved revision changes only after the writer succeeds. Canceled dialogs and write errors preserve the previous saved revision and destination requirement; an unsaved production shows **Save canceled** or **Save failed** beside its status. Undo to the saved revision restores the clean status, and redo away from it restores **Unsaved changes** without serializing or comparing project JSON.

Edits can continue during a save. A completed save records the revision that was sent to disk, so later edits and drafts remain unsaved. The notification explains that the earlier revision was saved. Overlapping saves and production replacement are blocked while a file operation is pending. The epoch check also prevents an old save completion from establishing a baseline after a programmatic reload, including a reload of the same project ID. Opening a file rechecks for intervening edits or drafts before applying its asynchronous result.

New and Open ask before replacing unsaved work. Pending invalid edits must first be corrected or canceled with Escape. Closing or switching a modal cannot silently discard its pending draft. Native close protection subscribes directly to the store's unsaved-work selector; the browser unload guard reads the current store state. Recovery restoration uses the same replacement guard and starts with no saved-file baseline.

In browser preview, **Project download requested** reports the browser handoff. The browser does not expose whether the download reached disk; verify the downloaded file before keeping it as a backup. Desktop **Project file saved** follows the native atomic write's success.

## Verification

Run `pnpm test`, `pnpm test:desktop`, `pnpm build`, `pnpm test:editor` and `pnpm test:recovery`. The dedicated file-session tests cover initial/opened/recovered baselines, Save As, canceled/failed/stale saves, edits and drafts during saves, undo/redo, replacement guards, pending dialog drafts and serialization-free dirty tracking.

The production Electron workflow injects an actual write failure and delays the native save dialog while another note edit commits. It checks the saved bytes, header and independent recovery status, saved-state undo/redo, pending-draft native close protection, invalid modal drafts, and canceled Open/New replacements. Recovery QA verifies a fresh-process restore and explicit save of the 500-performer, 128-set production.

Local Windows validation for this batch: 183 application/domain tests, 28 desktop/recovery tests, 11 release checks, TypeScript, dependency notices and the production renderer build passed. The production editor passed 28 workflows and native recovery passed its five restart/storage checks. The file status remains visible at the 1120-pixel desktop minimum and 1250 pixels. These are automated host checks; supported-platform human acceptance and representative school hardware remain separate release gates.
