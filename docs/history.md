# Named history and transaction contract

Every committed project command creates a named, reversible action. Names identify the affected picture, performer, selection or section. The History control opens a list of applied actions and available redo actions, with Undo/Redo controls. Selection, camera, playback and other session controls remain outside project history.

## Commit and cancel

Performer names, section names, production title, ensemble, notes and color fields hold a local draft. Blur or Enter commits one action; Escape restores the original value. Notes use Shift+Enter for a newline. A color field may receive many values from one picker session, but only its final value commits when the field loses focus or Enter applies it. Escape cancels its draft. Drafts remain visible to close/open/save guards and are cleared on project replacement.

Pointer gestures retain their geometry preview locally. Pointer-up commits one movement command, named with the affected selection and picture. Pointer cancellation leaves the project and history untouched. Native input undo/select-all remains available while a text field has focus; project Undo/Redo reverses committed actions after leaving the field or from History.

The store also exposes explicit multi-command boundaries:

```ts
store.transact('Recolor Brass', () => {
  store.dispatch('section.update', { id: 'brass', update: { color: '#112233' } });
  store.dispatch('section.update', { id: 'brass', update: { color: '#445566' } });
});
```

`transact` groups synchronous commands and publishes one completed state. For a multi-event preview, `beginTransaction(name)`, `commitTransaction()` and `cancelTransaction()` provide explicit boundaries. Commit records the difference between the start and final state, so returning to the starting values creates no action and preserves the redo branch. Cancel restores the project, selection, playhead and previous history. Failed validation rolls the entire transaction back at commit; a thrown callback also rolls it back. Disabled commands return false and callers must handle that result. Nested transactions are rejected without canceling the outer transaction. Keep asynchronous work and file operations outside synchronous transaction callbacks.

## Patches, revisions and retention

History stores changed leaf values or structural containers, rather than whole-project snapshots. Immutable references skip unchanged branches; equal copied geometry is a no-op. Membership/order changes retain reversible array/entity or position-map references. Applying a patch batch copies each changed ancestor once, including large formations. Normal edit, no-op, undo/redo and dirty comparisons do not stringify the project. Imports and saves continue to use full format validation.

Each changed state has a unique session revision. Undo/redo restores an action's before/after revision; the explicitly saved revision therefore identifies a return to the saved state without JSON equality. A save finishing after a later edit retains the revision actually sent to disk. Serialization is reserved for file output and deferred recovery; uncommitted store transaction previews are excluded from recovery. The broader file-save/recovery status interface and asynchronous storage remain #38 and #7.

`HISTORY_LIMITS` retains at most 80 actions and targets 16 MiB of estimated patch payload. Oldest applied actions expire when either limit is exceeded. The latest action is always retained; one unusually large structural action can exceed the estimate. The panel discloses this exception and reports expired actions. This is an estimated history policy, not a hard limit on JavaScript or application memory. A new edit clears redo. Opening another production clears history; `.squid` files and recovery payloads do not store it. Save named files for versions that must survive those boundaries.

## Validation

Unit checks cover no-op edits, leaf patches, maximum formations/all-roster removal, grouped notes/colors, cancellation, validation rollback, nested boundaries, loads, revision identity, undo branching and both retention limits. Production Electron checks type a 40-character note and performer name, rename a production, send multiple color values, cancel text/color drafts, drag across multiple frames and reopen a file. Each committed interaction creates one named action, and Undo/Redo updates the saved-state indicator.

[Performance measurements](performance.md#named-history-issue-6) compare store latency and retained heap with the A02 snapshot/JSON implementation on the same maximum fixture and host. They exclude renderer/analysis and do not fulfill the separate hardware/platform/writer acceptance gates.
