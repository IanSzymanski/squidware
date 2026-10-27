# Show-wide problems review evidence

Design guidance sections 1–5 apply; behavior, reused components and the measured 14 px marker-lane cost are described in [show-wide problems](../../show-wide-problems.md). Default field height remains within the approximately 470 px target. No unresolved layout deviation is claimed as waived.

The before image was captured from merged main `471e195` with the same 16-performer, four-set fixture used by the after workflow. Local Electron execution uses an Xorg dummy display and a temporary binary wrapper adding `--no-sandbox --disable-dev-shm-usage`; those flags are not product changes or platform certification. Hosted Windows/macOS/Linux certification and package checks remain CI responsibilities.

- [Before](problems-before.png) · [field and timeline](problems-field-dark.png) · [all findings](problems-panel-dark.png)
- [Selected finding and path](problems-selected.png)
- [Pending drag](problems-drag-pending.png) · [ready drag](problems-drag-ready.png) · [unavailable move](problems-unavailable.png)
- [Light](problems-light.png) · [high contrast](problems-high-contrast.png) · [narrow field](problems-field-narrow.png) · [enlarged panel](problems-enlarged.png)
- [Automated checks and measurements](results.json)

The source suite compares all fixture moves with the independent reference, and checks representative first/middle/last moves of the 500-performer, 127-move maximum show. Native input reaches every paginated finding and checks filters, search, selection, navigation, cancellation and retry. Save/reopen is unchanged; existing native and analysis-rules workflows own persistence. Findings and drag results add no saved metadata. Physical hardware and participant review are not completion gates under the maintained validation policy.
